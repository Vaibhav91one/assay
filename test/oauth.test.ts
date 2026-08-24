// src/api/oauth.ts -- the OAuth 2.1 server that exists solely because
// claude.ai's custom-connector picker only offers OAuth, not a bare
// Authorization header field. Almost all of this is database behaviour, so
// almost all of it early-returns without Postgres -- run with
// ASSAY_REQUIRE_DB=1 or it is asserting nothing.

import { createHash, randomBytes } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  registerClient, getClient, createAuthCode, redeemAuthCode, refreshAccessToken, canonicalOrigin,
} from '../src/api/oauth.js';
import { verifyKey } from '../src/api/keys.js';
import { getDb, closeDb, oauthClients, oauthCodes, sql, eq } from '../src/store/index.js';

const REDIRECT = 'https://claude.ai/api/mcp/auth_callback';

let dbUp = false;

const b64url = (buf: Buffer) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** A real PKCE pair, the same shape a real client generates (RFC7636). */
function pkcePair() {
  const verifier = b64url(randomBytes(32));
  const challenge = b64url(createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
}

async function wipe() {
  const d = getDb();
  // Refresh tokens FK to api_keys -- cleared first, or the api_keys delete
  // below throws a foreign-key violation on any row this suite's own
  // refreshAccessToken() tests left behind.
  await d.execute(sql`
    DELETE FROM oauth_refresh_tokens WHERE key_id IN (
      SELECT key_id FROM api_keys WHERE name LIKE 'oauth:oauth-test-%'
    )`);
  await d.execute(sql`DELETE FROM oauth_codes WHERE client_id LIKE 'oac_test_%'`);
  await d.execute(sql`DELETE FROM oauth_clients WHERE client_id LIKE 'oac_test_%'`);
  await d.execute(sql`DELETE FROM api_keys WHERE name LIKE 'oauth:oauth-test-%'`);
}

beforeAll(async () => {
  try { getDb(); await getDb().select().from(oauthClients).limit(1); dbUp = true; } catch { dbUp = false; }
  if (process.env.ASSAY_REQUIRE_DB && !dbUp) throw new Error('ASSAY_REQUIRE_DB is set and Postgres is unreachable');
  if (dbUp) await wipe();
});

afterAll(async () => {
  if (dbUp) await wipe().catch(() => {});
  await closeDb();
});

describe('canonicalOrigin', () => {
  // No Postgres needed -- pure function of the request's headers.

  it('trusts x-forwarded-host/proto over the raw Host header', () => {
    // The real bug: behind ngrok, request.url's own origin is the proxy's
    // internal target (http://localhost:3911), unreachable from a real
    // client. Confirmed live against claude.ai's backend, which rejected
    // registration outright on exactly this before ever calling
    // /api/oauth/register.
    const request = new Request('http://localhost:3911/api/mcp', {
      headers: { 'x-forwarded-host': 'unloved-isolation-script.ngrok-free.dev', 'x-forwarded-proto': 'https' },
    });
    expect(canonicalOrigin(request)).toBe('https://unloved-isolation-script.ngrok-free.dev');
  });

  it('defaults to https when x-forwarded-proto is absent but the host is forwarded', () => {
    const request = new Request('http://localhost:3911/api/mcp', {
      headers: { 'x-forwarded-host': 'assay.example' },
    });
    expect(canonicalOrigin(request)).toBe('https://assay.example');
  });

  it('falls back to the request URL\'s own origin with no reverse proxy', () => {
    const request = new Request('http://localhost:3911/api/mcp');
    expect(canonicalOrigin(request)).toBe('http://localhost:3911');
  });
});

describe('registerClient', () => {
  it('refuses an empty or missing redirect_uris', async () => {
    if (!dbUp) return;
    expect(await registerClient({ redirectUris: [] })).toBeNull();
    expect(await registerClient({ redirectUris: undefined })).toBeNull();
    expect(await registerClient({ redirectUris: 'not-an-array' })).toBeNull();
  });

  it('refuses a redirect_uri that is neither https nor localhost', async () => {
    if (!dbUp) return;
    expect(await registerClient({ redirectUris: ['http://evil.example/callback'] })).toBeNull();
    expect(await registerClient({ redirectUris: ['not a url at all'] })).toBeNull();
  });

  it('accepts a real https redirect_uri and a localhost http one', async () => {
    if (!dbUp) return;
    const client = await registerClient({
      redirectUris: [REDIRECT, 'http://localhost:6274/callback'],
      clientName: 'oauth-test-claude',
    });
    expect(client).not.toBeNull();
    expect(client!.clientId).toMatch(/^oac_/);
    expect(client!.redirectUris).toEqual([REDIRECT, 'http://localhost:6274/callback']);

    const fetched = await getClient(client!.clientId);
    expect(fetched).toEqual(client);
  });

  it('getClient answers null for an unknown or empty id', async () => {
    if (!dbUp) return;
    expect(await getClient('oac_does_not_exist')).toBeNull();
    expect(await getClient('')).toBeNull();
  });
});

describe('the authorize-then-token round trip', () => {
  async function freshClient(name: string) {
    return (await registerClient({ redirectUris: [REDIRECT], clientName: name }))!;
  }

  it('redeems a correctly-proven code for a real, working API key', async () => {
    if (!dbUp) return;
    const client = await freshClient('oauth-test-happy-path');
    const { verifier, challenge } = pkcePair();
    const code = await createAuthCode({
      clientId: client.clientId, redirectUri: REDIRECT, codeChallenge: challenge,
    });

    const result = await redeemAuthCode({
      code, clientId: client.clientId, redirectUri: REDIRECT, codeVerifier: verifier,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Not a second, parallel token system -- this IS an api_keys row, and the
    // exact verifyKey() every /api/v1 and /api/mcp request already runs
    // against accepts it.
    expect(result.accessToken).toMatch(/^ak_/);
    const verified = await verifyKey(result.accessToken);
    expect(verified).not.toBeNull();
    expect(verified!.name).toBe(`oauth:${client.clientName}`);

    // Short-lived, and renewable -- OAuth 2.1's own guidance, not left unset.
    expect(result.refreshToken).toMatch(/^art_/);
    expect(result.expiresIn).toBe(3600);
  });

  it('refuses a code redeemed twice', async () => {
    if (!dbUp) return;
    const client = await freshClient('oauth-test-replay');
    const { verifier, challenge } = pkcePair();
    const code = await createAuthCode({
      clientId: client.clientId, redirectUri: REDIRECT, codeChallenge: challenge,
    });

    const first = await redeemAuthCode({ code, clientId: client.clientId, redirectUri: REDIRECT, codeVerifier: verifier });
    expect(first.ok).toBe(true);

    const second = await redeemAuthCode({ code, clientId: client.clientId, redirectUri: REDIRECT, codeVerifier: verifier });
    expect(second).toEqual({ ok: false, error: 'invalid_grant' });
  });

  it('refuses a mismatched PKCE verifier', async () => {
    if (!dbUp) return;
    const client = await freshClient('oauth-test-pkce');
    const { challenge } = pkcePair();
    const code = await createAuthCode({
      clientId: client.clientId, redirectUri: REDIRECT, codeChallenge: challenge,
    });

    const { verifier: wrongVerifier } = pkcePair();
    const result = await redeemAuthCode({
      code, clientId: client.clientId, redirectUri: REDIRECT, codeVerifier: wrongVerifier,
    });
    expect(result).toEqual({ ok: false, error: 'invalid_grant' });
  });

  it('refuses a redirect_uri that does not match what was registered', async () => {
    // Checked before the code is ever touched (see redeemAuthCode's own
    // comment) -- an unregistered redirect_uri is a client-configuration
    // problem, not a stale-or-replayed-code one, and the error reflects that.
    if (!dbUp) return;
    const client = await freshClient('oauth-test-redirect-mismatch');
    const { verifier, challenge } = pkcePair();
    const code = await createAuthCode({
      clientId: client.clientId, redirectUri: REDIRECT, codeChallenge: challenge,
    });

    const result = await redeemAuthCode({
      code, clientId: client.clientId, redirectUri: 'https://not-the-registered-uri.example/cb', codeVerifier: verifier,
    });
    expect(result).toEqual({ ok: false, error: 'invalid_client' });
  });

  it('refuses an unknown client_id outright, before touching any code', async () => {
    if (!dbUp) return;
    const result = await redeemAuthCode({
      code: 'oc_does_not_exist', clientId: 'oac_does_not_exist', redirectUri: REDIRECT, codeVerifier: 'x',
    });
    expect(result).toEqual({ ok: false, error: 'invalid_client' });
  });

  it('refuses an expired code', async () => {
    if (!dbUp) return;
    const client = await freshClient('oauth-test-expired');
    const { verifier, challenge } = pkcePair();
    const code = await createAuthCode({
      clientId: client.clientId, redirectUri: REDIRECT, codeChallenge: challenge,
    });
    // Back-date it past the 5-minute TTL directly, rather than waiting five
    // real minutes for a unit test to prove a clock comparison works.
    await getDb().update(oauthCodes)
      .set({ createdAt: new Date(Date.now() - 10 * 60 * 1000) })
      .where(eq(oauthCodes.code, code));

    const result = await redeemAuthCode({
      code, clientId: client.clientId, redirectUri: REDIRECT, codeVerifier: verifier,
    });
    expect(result).toEqual({ ok: false, error: 'invalid_grant' });
  });
});

describe('refreshAccessToken', () => {
  async function freshPair(name: string) {
    const client = (await registerClient({ redirectUris: [REDIRECT], clientName: name }))!;
    const { verifier, challenge } = pkcePair();
    const code = await createAuthCode({ clientId: client.clientId, redirectUri: REDIRECT, codeChallenge: challenge });
    const redeemed = await redeemAuthCode({ code, clientId: client.clientId, redirectUri: REDIRECT, codeVerifier: verifier });
    if (!redeemed.ok) throw new Error('fixture setup failed');
    return { client, ...redeemed };
  }

  it('rotates: a new pair works, and the old access token stops working', async () => {
    if (!dbUp) return;
    const first = await freshPair('oauth-test-refresh-happy');
    expect(await verifyKey(first.accessToken)).not.toBeNull();

    const second = await refreshAccessToken({ refreshToken: first.refreshToken, clientId: first.client.clientId });
    expect(second.ok).toBe(true);
    if (!second.ok) return;

    expect(second.accessToken).not.toBe(first.accessToken);
    expect(second.refreshToken).not.toBe(first.refreshToken);
    expect(await verifyKey(second.accessToken)).not.toBeNull();
    // Rotated, not merely allowed to expire an hour from now -- revoked the
    // instant the refresh token that renews it was redeemed.
    expect(await verifyKey(first.accessToken)).toBeNull();
  });

  it('refuses a refresh token redeemed twice', async () => {
    if (!dbUp) return;
    const first = await freshPair('oauth-test-refresh-replay');
    const ok = await refreshAccessToken({ refreshToken: first.refreshToken, clientId: first.client.clientId });
    expect(ok.ok).toBe(true);

    const replay = await refreshAccessToken({ refreshToken: first.refreshToken, clientId: first.client.clientId });
    expect(replay).toEqual({ ok: false, error: 'invalid_grant' });
  });

  it('refuses a refresh token presented with the wrong client_id', async () => {
    if (!dbUp) return;
    const first = await freshPair('oauth-test-refresh-wrong-client');
    const other = (await registerClient({ redirectUris: [REDIRECT], clientName: 'oauth-test-refresh-other' }))!;
    const result = await refreshAccessToken({ refreshToken: first.refreshToken, clientId: other.clientId });
    expect(result).toEqual({ ok: false, error: 'invalid_grant' });
  });

  it('refuses an unknown refresh token or client outright', async () => {
    if (!dbUp) return;
    expect(await refreshAccessToken({ refreshToken: 'art_does_not_exist', clientId: 'oac_does_not_exist' }))
      .toEqual({ ok: false, error: 'invalid_client' });
  });
});
