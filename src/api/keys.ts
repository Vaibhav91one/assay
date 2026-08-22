// Consumer API keys for the read-only REST surface.
//
// Only the hash is stored, so a leaked database is not a set of working
// credentials. The plaintext is returned once at creation and never again.

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { eq, and, isNull } from 'drizzle-orm';
import { getDb, apiKeys } from '../store/index.js';

const PREFIX = 'ak_';

export const hashKey = (key: string): string => createHash('sha256').update(key).digest('hex');

/** Mint a key. The plaintext is in the return value and nowhere else, ever. */
export async function createKey(name: string) {
  const key = PREFIX + randomBytes(24).toString('hex');
  const [row] = await getDb().insert(apiKeys).values({
    name,
    keyPrefix: key.slice(0, 11),
    hash: hashKey(key),
  }).returning({ keyId: apiKeys.keyId, keyPrefix: apiKeys.keyPrefix });
  return { ...row, key };            // `key` is the only time the secret exists
}

/**
 * Verify a presented key. Returns the key row, or null.
 *
 * The hash is the lookup, so this is an indexed equality -- but the comparison
 * is still constant-time against the stored hash. Never log `presented`: it is
 * the live credential.
 */
export async function verifyKey(presented: unknown) {
  if (typeof presented !== 'string' || !presented.startsWith(PREFIX)) return null;
  const hash = hashKey(presented);
  const [row] = await getDb().select().from(apiKeys)
    .where(and(eq(apiKeys.hash, hash), isNull(apiKeys.revokedAt))).limit(1);
  if (!row) return null;

  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(row.hash, 'hex');
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  // Fire-and-forget: a failed last-used update must not fail the request.
  getDb().update(apiKeys).set({ lastUsedAt: new Date() })
    .where(eq(apiKeys.keyId, row.keyId)).catch(() => {});
  return row;
}

/**
 * Pull the bearer token off a Request.
 *
 * Accepts `Authorization: Bearer <key>` only -- not a query parameter, which
 * would put the credential in access logs and browser history.
 */
export function bearerFrom(request: Request): string | null {
  const h = request.headers.get('authorization') || '';
  const m = /^Bearer\s+(\S+)$/i.exec(h);
  return m ? m[1]! : null;
}

/** Guard a route. Returns null when authorised, or the 401 Response to send. */
export async function requireKey(request: Request): Promise<Response | null> {
  const key = bearerFrom(request);
  if (!key || !(await verifyKey(key))) {
    return Response.json(
      { error: 'unauthorized', detail: 'Send Authorization: Bearer <api key>.' },
      { status: 401, headers: { 'WWW-Authenticate': 'Bearer' } },
    );
  }
  return null;
}
