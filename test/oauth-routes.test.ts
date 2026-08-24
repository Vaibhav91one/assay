// The HTTP surface of src/api/oauth.ts -- the actual shapes claude.ai's
// backend sends and expects, per RFC9728, RFC8414 and RFC7591. A unit test on
// the underlying functions cannot catch a route wiring the wrong field name
// into a JSON response; this is the test that reads the route files as HTTP.

import { createHash, randomBytes } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getDb, closeDb, oauthClients, sql } from '../src/store/index.js';

let dbUp = false;

beforeAll(async () => {
  try { getDb(); await getDb().select().from(oauthClients).limit(1); dbUp = true; } catch { dbUp = false; }
  if (process.env.ASSAY_REQUIRE_DB && !dbUp) throw new Error('ASSAY_REQUIRE_DB is set and Postgres is unreachable');
});

afterAll(async () => {
  if (dbUp) {
    // Refresh tokens FK to api_keys -- cleared first, same reason
    // test/oauth.test.ts's wipe() gives.
    await getDb().execute(sql`
      DELETE FROM oauth_refresh_tokens WHERE key_id IN (
        SELECT key_id FROM api_keys WHERE name LIKE 'oauth:oauth-routes-test%'
      )`);
    await getDb().execute(sql`DELETE FROM oauth_codes WHERE client_id LIKE 'oac_%'`);
    await getDb().execute(sql`DELETE FROM oauth_clients WHERE client_name LIKE 'oauth-routes-test%'`);
    await getDb().execute(sql`DELETE FROM api_keys WHERE name LIKE 'oauth:oauth-routes-test%'`);
  }
  await closeDb();
});

const b64url = (buf: Buffer) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

describe('/.well-known/oauth-protected-resource', () => {
  it('names /api/mcp as the resource and this origin as the authorization server', async () => {
    const { GET } = await import('../web/app/.well-known/oauth-protected-resource/route.js');
    const res = await GET(new Request('https://assay.example/.well-known/oauth-protected-resource'));
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.resource).toBe('https://assay.example/api/mcp');
    expect(body.authorization_servers).toEqual(['https://assay.example']);
  });

  it('answers with the reverse proxy\'s public origin, not the internal Host header', async () => {
    // Real bug, found live: behind ngrok (or any real self-host reverse
    // proxy), the `Host` header Node sees is the proxy's internal target --
    // `localhost:3911` -- not the public address a real OAuth client reaches.
    // claude.ai's own backend rejected registration outright on exactly this:
    // the discovered issuer was `https://localhost:3911`, unreachable from
    // its side, and it never even called /api/oauth/register.
    const { GET } = await import('../web/app/.well-known/oauth-protected-resource/route.js');
    const res = await GET(new Request('http://localhost:3911/.well-known/oauth-protected-resource', {
      headers: {
        'x-forwarded-host': 'unloved-isolation-script.ngrok-free.dev',
        'x-forwarded-proto': 'https',
      },
    }));
    const body: any = await res.json();
    expect(body.resource).toBe('https://unloved-isolation-script.ngrok-free.dev/api/mcp');
    expect(body.authorization_servers).toEqual(['https://unloved-isolation-script.ngrok-free.dev']);
  });
});

describe('/.well-known/oauth-authorization-server', () => {
  it('advertises S256-only PKCE and no client secret', async () => {
    const { GET } = await import('../web/app/.well-known/oauth-authorization-server/route.js');
    const res = await GET(new Request('https://assay.example/.well-known/oauth-authorization-server'));
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.issuer).toBe('https://assay.example');
    expect(body.authorization_endpoint).toBe('https://assay.example/oauth/authorize');
    expect(body.token_endpoint).toBe('https://assay.example/api/oauth/token');
    expect(body.registration_endpoint).toBe('https://assay.example/api/oauth/register');
    expect(body.code_challenge_methods_supported).toEqual(['S256']);
    expect(body.token_endpoint_auth_methods_supported).toEqual(['none']);
    expect(body.grant_types_supported).toEqual(['authorization_code', 'refresh_token']);
  });

  it('advertises the reverse proxy\'s public origin as the issuer', async () => {
    const { GET } = await import('../web/app/.well-known/oauth-authorization-server/route.js');
    const res = await GET(new Request('http://localhost:3911/.well-known/oauth-authorization-server', {
      headers: { 'x-forwarded-host': 'assay.example', 'x-forwarded-proto': 'https' },
    }));
    const body: any = await res.json();
    expect(body.issuer).toBe('https://assay.example');
    expect(body.token_endpoint).toBe('https://assay.example/api/oauth/token');
  });
});

describe('POST /api/oauth/register', () => {
  it('registers a client per RFC7591 and returns no client_secret', async () => {
    if (!dbUp) return;
    const { POST } = await import('../web/app/api/oauth/register/route.js');
    const res = await POST(new Request('https://assay.example/api/oauth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        redirect_uris: ['https://claude.ai/api/mcp/auth_callback'],
        client_name: 'oauth-routes-test',
      }),
    }));
    expect(res.status).toBe(201);
    const body: any = await res.json();
    expect(body.client_id).toMatch(/^oac_/);
    expect(body.client_secret).toBeUndefined();
    expect(body.token_endpoint_auth_method).toBe('none');
    expect(body.redirect_uris).toEqual(['https://claude.ai/api/mcp/auth_callback']);
  });

  it('refuses malformed redirect_uris with 400, not a 500', async () => {
    if (!dbUp) return;
    const { POST } = await import('../web/app/api/oauth/register/route.js');
    const res = await POST(new Request('https://assay.example/api/oauth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ redirect_uris: ['ftp://not-allowed'] }),
    }));
    expect(res.status).toBe(400);
    const body: any = await res.json();
    expect(body.error).toBe('invalid_client_metadata');
  });
});

describe('POST /api/oauth/token', () => {
  it('completes a real authorize-then-token round trip over HTTP', async () => {
    if (!dbUp) return;
    const { registerClient, createAuthCode } = await import('../src/api/oauth.js');
    const { POST } = await import('../web/app/api/oauth/token/route.js');

    const client = (await registerClient({
      redirectUris: ['https://claude.ai/api/mcp/auth_callback'],
      clientName: 'oauth-routes-test',
    }))!;
    const verifier = b64url(randomBytes(32));
    const challenge = b64url(createHash('sha256').update(verifier).digest());
    const code = await createAuthCode({
      clientId: client.clientId,
      redirectUri: 'https://claude.ai/api/mcp/auth_callback',
      codeChallenge: challenge,
    });

    const form = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: client.clientId,
      redirect_uri: 'https://claude.ai/api/mcp/auth_callback',
      code_verifier: verifier,
    });
    const res = await POST(new Request('https://assay.example/api/oauth/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    }));
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.access_token).toMatch(/^ak_/);
    expect(body.token_type).toBe('Bearer');
    expect(body.expires_in).toBe(3600);
    expect(body.refresh_token).toMatch(/^art_/);
  });

  it('renews a real pair over HTTP with grant_type=refresh_token, and retires the old access token', async () => {
    if (!dbUp) return;
    const { registerClient, createAuthCode } = await import('../src/api/oauth.js');
    const { verifyKey } = await import('../src/api/keys.js');
    const { POST } = await import('../web/app/api/oauth/token/route.js');

    const client = (await registerClient({
      redirectUris: ['https://claude.ai/api/mcp/auth_callback'],
      clientName: 'oauth-routes-test-refresh',
    }))!;
    const verifier = b64url(randomBytes(32));
    const challenge = b64url(createHash('sha256').update(verifier).digest());
    const code = await createAuthCode({
      clientId: client.clientId, redirectUri: 'https://claude.ai/api/mcp/auth_callback', codeChallenge: challenge,
    });
    const first: any = await (await POST(new Request('https://assay.example/api/oauth/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code', code, client_id: client.clientId,
        redirect_uri: 'https://claude.ai/api/mcp/auth_callback', code_verifier: verifier,
      }).toString(),
    }))).json();

    const res = await POST(new Request('https://assay.example/api/oauth/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token', refresh_token: first.refresh_token, client_id: client.clientId,
      }).toString(),
    }));
    expect(res.status).toBe(200);
    const second: any = await res.json();
    expect(second.access_token).not.toBe(first.access_token);
    expect(second.refresh_token).not.toBe(first.refresh_token);

    expect(await verifyKey(second.access_token)).not.toBeNull();
    expect(await verifyKey(first.access_token)).toBeNull();
  });

  it('refuses a JSON body -- the token endpoint is form-encoded per spec', async () => {
    if (!dbUp) return;
    const { POST } = await import('../web/app/api/oauth/token/route.js');
    const res = await POST(new Request('https://assay.example/api/oauth/token', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ grant_type: 'authorization_code' }),
    }));
    expect(res.status).toBe(400);
    const body: any = await res.json();
    expect(body.error).toBe('invalid_request');
  });

  it('refuses an unsupported grant_type', async () => {
    if (!dbUp) return;
    const { POST } = await import('../web/app/api/oauth/token/route.js');
    const form = new URLSearchParams({ grant_type: 'client_credentials' });
    const res = await POST(new Request('https://assay.example/api/oauth/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    }));
    expect(res.status).toBe(400);
    const body: any = await res.json();
    expect(body.error).toBe('unsupported_grant_type');
  });
});
