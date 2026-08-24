// OAuth 2.1 for /api/mcp -- claude.ai's connector picker only offers OAuth
// (automatic dynamic client registration, or a manually pre-configured OAuth
// client id), not a field to paste a bearer token into. Confirmed live: the
// custom-connector form has no such field, and fails with "Couldn't register
// with Assay's sign-in service" against an endpoint that has no OAuth server
// at all. This file is that server, scoped to exactly the one thing this
// product needs it to prove: that a real operator approved this client.
//
// PUBLIC CLIENTS ONLY. No client_secret is ever issued -- RFC7591 leaves that
// to the server's judgement, and PKCE (RFC7636, S256 only, "plain" refused)
// is the proof a code exchange came from the same party that started the
// flow, which is the whole reason PKCE exists for a client that cannot hold
// a secret credential of its own.
//
// AN ACCESS TOKEN HERE IS A REAL `api_keys` ROW. Not a second token system:
// `web/app/api/mcp/route.ts`'s `requireKey()` gate (`src/api/keys.ts`) does
// not change at all, because what this hands back at the end of the flow IS
// one of the keys that gate already verifies -- `createKey()` below is the
// exact function `bin/assay.ts apikey` calls. OAuth here is a
// consent-and-provisioning screen in front of that, nothing more.

import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { eq, and, isNull } from 'drizzle-orm';
import { getDb, oauthClients, oauthCodes, oauthRefreshTokens, apiKeys } from '../store/index.js';
import { createKey, hashKey } from './keys.js';

/**
 * The origin every metadata document (and the `resource_metadata` pointer on
 * `/api/mcp`'s 401) advertises. NOT `new URL(request.url).origin` -- that
 * reads the `Host` header the Node process actually received, which behind
 * any reverse proxy (docs/self-host.mdx already assumes one; today's own
 * verification used ngrok) is the proxy's INTERNAL target, not the public
 * address a real OAuth client reaches. Confirmed live: through ngrok, that
 * origin came out `https://localhost:3911` -- unreachable from claude.ai's
 * backend, and the exact reason its own registration step failed before ever
 * calling this server, with no request reaching `/api/oauth/register` at all.
 *
 * `x-forwarded-host`/`x-forwarded-proto` are what a reverse proxy sets to
 * carry the original request along -- trusted here because this app already
 * assumes it only ever runs behind one on a real network (see
 * `web/next.config.ts`'s own header comment on the same point).
 */
export function canonicalOrigin(request: Request): string {
  const forwardedHost = request.headers.get('x-forwarded-host');
  if (forwardedHost) {
    const proto = request.headers.get('x-forwarded-proto') ?? 'https';
    return `${proto}://${forwardedHost}`;
  }
  return new URL(request.url).origin;
}

const CLIENT_ID_PREFIX = 'oac_';
const CODE_PREFIX = 'oc_';
const REFRESH_PREFIX = 'art_';
// RFC6749's own guidance for authorization codes: minutes, not longer. This
// is the window between the operator clicking Approve and the client
// finishing the token exchange, which in practice is under a second.
const CODE_TTL_MS = 5 * 60 * 1000;
// OAuth 2.1 §7 ("Security Considerations"): "Authorization servers SHOULD
// issue short-lived access tokens". An hour is short enough that a leaked
// token stops mattering on its own within the day, and long enough that a
// real client (claude.ai, polling a connector across a conversation) is not
// re-authenticating every few tool calls -- it refreshes instead, silently,
// with the refresh token minted alongside this one.
const ACCESS_TOKEN_TTL_MS = 60 * 60 * 1000;

export interface RegisteredClient {
  clientId: string;
  clientName: string | null;
  redirectUris: string[];
}

/**
 * A redirect URI a code could ever be sent back to. `localhost`/`127.0.0.1`
 * is the one plain-HTTP exception a native or local dev client needs
 * (OAuth 2.1 §4.1.1); every other origin must be HTTPS -- a code or token
 * sent over plain HTTP to a real host is interceptable in transit.
 */
function validRedirectUri(u: unknown): u is string {
  if (typeof u !== 'string') return false;
  try {
    const parsed = new URL(u);
    if (parsed.protocol === 'https:') return true;
    return parsed.protocol === 'http:' && (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1');
  } catch {
    return false;
  }
}

/**
 * RFC7591 dynamic client registration. `redirect_uris` is the one thing this
 * refuses to accept empty or malformed -- everything downstream (the
 * authorize screen, the token exchange) trusts that stored list as the ONLY
 * places a code for this client is allowed to be redeemed against.
 */
export async function registerClient(input: {
  redirectUris: unknown;
  clientName?: unknown;
}): Promise<RegisteredClient | null> {
  if (!Array.isArray(input.redirectUris) || input.redirectUris.length === 0) return null;
  if (!input.redirectUris.every(validRedirectUri)) return null;
  const redirectUris = input.redirectUris as string[];
  const clientName = typeof input.clientName === 'string' ? input.clientName : null;

  const clientId = CLIENT_ID_PREFIX + randomBytes(16).toString('hex');
  await getDb().insert(oauthClients).values({ clientId, clientName, redirectUris });
  return { clientId, clientName, redirectUris };
}

export async function getClient(clientId: string): Promise<RegisteredClient | null> {
  if (!clientId) return null;
  const [row] = await getDb().select().from(oauthClients)
    .where(eq(oauthClients.clientId, clientId)).limit(1);
  return row ? { clientId: row.clientId, clientName: row.clientName, redirectUris: row.redirectUris } : null;
}

/**
 * Issued only after the operator approves the consent screen
 * (`web/app/oauth/authorize/actions.ts`) -- this function does not check who
 * is asking, because the page that calls it already required an operator
 * session via the same `assertOperator()` every other Server Action does.
 */
export async function createAuthCode(input: {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  resource?: string | null;
}): Promise<string> {
  const code = CODE_PREFIX + randomBytes(24).toString('hex');
  await getDb().insert(oauthCodes).values({
    code,
    clientId: input.clientId,
    redirectUri: input.redirectUri,
    codeChallenge: input.codeChallenge,
    resource: input.resource ?? null,
  });
  return code;
}

const b64url = (buf: Buffer): string =>
  buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** RFC7636 §4.6: challenge = BASE64URL(SHA256(verifier)). S256 only -- "plain" is never accepted. */
function verifyPkce(verifier: string, challenge: string): boolean {
  const computed = b64url(createHash('sha256').update(verifier).digest());
  const a = Buffer.from(computed);
  const b = Buffer.from(challenge);
  return a.length === b.length && timingSafeEqual(a, b);
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

/**
 * Mint an access key (short-lived, per `ACCESS_TOKEN_TTL_MS`) and a refresh
 * token paired to it, for one client. The pairing (`oauthRefreshTokens.keyId`)
 * is what lets `refreshAccessToken()` below revoke the OLD access key the
 * moment its refresh token is redeemed, rather than leaving it to expire on
 * its own an hour later -- a rotated credential that still works is a
 * credential nobody meant to still work.
 */
async function mintTokenPair(clientId: string, clientName: string | null): Promise<TokenPair> {
  const { key, keyId } = await createKey(
    `oauth:${clientName ?? clientId}`,
    null,
    new Date(Date.now() + ACCESS_TOKEN_TTL_MS),
  );
  const refreshToken = REFRESH_PREFIX + randomBytes(24).toString('hex');
  await getDb().insert(oauthRefreshTokens).values({
    hash: hashKey(refreshToken),
    clientId,
    keyId,
  });
  return { accessToken: key, refreshToken, expiresIn: Math.floor(ACCESS_TOKEN_TTL_MS / 1000) };
}

export type RedeemResult =
  | ({ ok: true } & TokenPair)
  | { ok: false; error: 'invalid_grant' | 'invalid_client' };

/**
 * The token exchange (RFC6749 §4.1.3). Every check here is a documented OAuth
 * requirement, not a judgement call: exact client match, exact redirect_uri
 * match, unexpired, unused, PKCE recomputed and compared in constant time.
 *
 * Claiming the code (the transaction) and minting the key are deliberately
 * two steps, not one transaction: `createKey()` is the same function the CLI
 * calls and does not take a transaction handle, and giving it one now would
 * change tested, shared code for this caller alone. The failure mode of that
 * split -- the code gets marked used but the key mint then fails -- burns one
 * authorization code and nothing else; the client simply restarts the flow.
 * It cannot double-spend the code, which is the property that matters.
 */
export async function redeemAuthCode(input: {
  code: string;
  clientId: string;
  redirectUri: string;
  codeVerifier: string;
}): Promise<RedeemResult> {
  const client = await getClient(input.clientId);
  if (!client || !client.redirectUris.includes(input.redirectUri)) {
    return { ok: false, error: 'invalid_client' };
  }

  const db = getDb();
  const claimed = await db.transaction(async (tx) => {
    const [row] = await tx.select().from(oauthCodes)
      .where(and(eq(oauthCodes.code, input.code), isNull(oauthCodes.usedAt)))
      .limit(1);
    if (!row) return null;
    if (row.clientId !== input.clientId || row.redirectUri !== input.redirectUri) return null;
    if (Date.now() - row.createdAt.getTime() > CODE_TTL_MS) return null;
    if (!verifyPkce(input.codeVerifier, row.codeChallenge)) return null;

    await tx.update(oauthCodes).set({ usedAt: new Date() }).where(eq(oauthCodes.code, input.code));
    return row;
  });
  if (!claimed) return { ok: false, error: 'invalid_grant' };

  const pair = await mintTokenPair(client.clientId, client.clientName);
  return { ok: true, ...pair };
}

export type RefreshResult =
  | ({ ok: true } & TokenPair)
  | { ok: false; error: 'invalid_grant' | 'invalid_client' };

/**
 * RFC6749 §6, rotating: the presented refresh token is single-use. A valid
 * redemption revokes the access key it was paired with immediately (not left
 * to expire on its own) and returns a brand new pair, so a client that keeps
 * refreshing never has to send the operator back through `/oauth/authorize`.
 */
export async function refreshAccessToken(input: {
  refreshToken: string;
  clientId: string;
}): Promise<RefreshResult> {
  const client = await getClient(input.clientId);
  if (!client) return { ok: false, error: 'invalid_client' };

  const db = getDb();
  const claimed = await db.transaction(async (tx) => {
    const [row] = await tx.select().from(oauthRefreshTokens)
      .where(and(eq(oauthRefreshTokens.hash, hashKey(input.refreshToken)), isNull(oauthRefreshTokens.usedAt)))
      .limit(1);
    if (!row || row.clientId !== input.clientId) return null;

    await tx.update(oauthRefreshTokens).set({ usedAt: new Date() }).where(eq(oauthRefreshTokens.hash, row.hash));
    // Revoke the access key this refresh token was renewing. Its own expiry
    // would have ended it within the hour regardless; revoking now closes the
    // window between "a new pair exists" and "the old one stops working".
    await tx.update(apiKeys).set({ revokedAt: new Date() }).where(eq(apiKeys.keyId, row.keyId));
    return row;
  });
  if (!claimed) return { ok: false, error: 'invalid_grant' };

  const pair = await mintTokenPair(client.clientId, client.clientName);
  return { ok: true, ...pair };
}
