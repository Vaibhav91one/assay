// Consumer API keys for the /api/v1 REST surface.
//
// NOT read-only: the same guard sits on reads and mutations. New keys can be
// restricted to named targets and to read versus write. A present scope fails
// closed when a route cannot be tied to one of those targets; a null scope is
// the additive legacy behavior and retains its former all-access authority.
//
// Only the hash is stored, so a leaked database is not a set of working
// credentials. The plaintext is returned once at creation and never again.

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { parseDocument } from 'yaml';
import { eq, and, or, isNull, gt, desc } from 'drizzle-orm';
import { getDb, apiKeys, sql } from '../store/index.js';

const PREFIX = 'ak_';

export const KeyScope = z.strictObject({
  access: z.enum(['read', 'write']),
  targets: z.array(z.string().min(1)).min(1),
});
export type KeyScope = z.infer<typeof KeyScope>;

export const hashKey = (key: string): string => createHash('sha256').update(key).digest('hex');

/**
 * Mint a key. The plaintext is in the return value and nowhere else, ever.
 *
 * `expiresAt` is for `src/api/oauth.ts` alone -- every other caller (the CLI,
 * the API tab) omits it and gets the permanent key this product has always
 * minted. See `schema.ts`'s own comment on the column for why only an
 * OAuth-issued key carries one.
 */
export async function createKey(name: string, scope?: KeyScope | null, expiresAt?: Date | null) {
  const key = PREFIX + randomBytes(24).toString('hex');
  const parsedScope = scope == null ? null : KeyScope.parse(scope);
  const [row] = await getDb().insert(apiKeys).values({
    name,
    keyPrefix: key.slice(0, 11),
    hash: hashKey(key),
    scope: parsedScope,
    expiresAt: expiresAt ?? null,
  }).returning({ keyId: apiKeys.keyId, keyPrefix: apiKeys.keyPrefix });
  return { ...row, key };            // `key` is the only time the secret exists
}

/** A key's own row, everything but the two fields that could ever act as the credential itself. */
export interface KeyPresence {
  keyId: number;
  name: string;
  keyPrefix: string;
  scope: KeyScope | null;
  createdAt: Date;
  lastUsedAt: Date | null;
  /** Null for every CLI/API-tab key. Set only on a key an OAuth token exchange minted. */
  expiresAt: Date | null;
}

/**
 * Every live key, newest first -- for a "manage your API keys" screen that has
 * no business ever seeing a hash or a plaintext. `keyPrefix` (the first 11
 * chars, `ak_` included) is the only thing this returns that looks like the
 * credential, and it is deliberately not enough of it to reconstruct one.
 */
export async function listKeys(): Promise<KeyPresence[]> {
  const rows = await getDb()
    .select({
      keyId: apiKeys.keyId, name: apiKeys.name, keyPrefix: apiKeys.keyPrefix,
      scope: apiKeys.scope, createdAt: apiKeys.createdAt, lastUsedAt: apiKeys.lastUsedAt,
      expiresAt: apiKeys.expiresAt,
    })
    .from(apiKeys)
    .where(isNull(apiKeys.revokedAt))
    .orderBy(desc(apiKeys.createdAt));
  return rows as KeyPresence[];
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
    .where(and(
      eq(apiKeys.hash, hash),
      isNull(apiKeys.revokedAt),
      // Null means "never expires" -- every key but an OAuth-issued one. A
      // present, past expiry is the same refusal as a revoked key: the row
      // still exists (an audit trail), it just no longer authenticates.
      or(isNull(apiKeys.expiresAt), gt(apiKeys.expiresAt, new Date())),
    )).limit(1);
  if (!row) return null;

  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(row.hash, 'hex');
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  // Fire-and-forget: a failed last-used update must not fail the request.
  getDb().update(apiKeys).set({ lastUsedAt: new Date() })
    .where(eq(apiKeys.keyId, row.keyId)).catch(() => {});
  if (row.scope != null) {
    const parsed = KeyScope.safeParse(row.scope);
    if (!parsed.success) return null;       // malformed stored authority fails closed
    return { ...row, scope: parsed.data };
  }
  return { ...row, scope: null };
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

type RouteCtx = { params?: Promise<Record<string, string>> };

const forbidden = (): Response => Response.json(
  { error: 'forbidden', detail: 'This API key does not grant access to that target or capability.' },
  { status: 403 },
);

async function jsonBody(request: Request): Promise<Record<string, any> | null> {
  try {
    const value = await request.clone().json();
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

async function targetForProof(proof: string): Promise<string | null> {
  const { rows } = await getDb().execute(sql`
    SELECT r.target_id FROM field_runs fr
    JOIN runs r ON r.run_id = fr.run_id
    WHERE fr.proof_id = ${proof} LIMIT 1
  `);
  return (rows as { target_id: string }[])[0]?.target_id ?? null;
}

async function targetForEpisode(episode: string): Promise<string | null> {
  if (!/^\d+$/.test(episode)) return null;
  const { rows } = await getDb().execute(sql`
    SELECT target_id FROM episodes WHERE episode_id = ${Number(episode)} LIMIT 1
  `);
  return (rows as { target_id: string }[])[0]?.target_id ?? null;
}

/**
 * Resolve the target this route actually addresses. Returning null means this
 * route has no target boundary, or that an indirect id did not resolve; both
 * are a denial for a scoped key.
 */
async function scopedTarget(request: Request, ctx?: RouteCtx): Promise<string | null> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/v1/, '') || '/';
  const params: Record<string, string> = await ctx?.params?.catch(() => ({})) ?? {};

  if (/^\/targets\//.test(path) || /^\/contracts\//.test(path)) {
    return params.target ?? (decodeURIComponent(path.split('/')[2] ?? '') || null);
  }
  if (/^\/(rows|explain)\//.test(path)) {
    const proof = params.proof ?? decodeURIComponent(path.split('/')[2] ?? '');
    return proof ? targetForProof(proof) : null;
  }
  if (/^\/reports\/incidents\//.test(path)) {
    const episode = params.episode ?? path.split('/')[3] ?? '';
    return targetForEpisode(episode);
  }

  if (path === '/contracts' && request.method !== 'GET') {
    const yaml = (await jsonBody(request))?.yaml;
    if (typeof yaml !== 'string') return null;
    const document = parseDocument(yaml);
    if (document.errors.length) return null;
    const parsed = document.toJS();
    return parsed && typeof parsed === 'object' && typeof parsed.target === 'string'
      ? parsed.target
      : null;
  }
  if (path.startsWith('/decisions/') || path === '/ai/nominate') {
    const proof = (await jsonBody(request))?.proof;
    return typeof proof === 'string' ? targetForProof(proof) : null;
  }
  if ((path === '/brake' || path === '/blast/retraction') && request.method !== 'GET') {
    const target = (await jsonBody(request))?.target;
    return typeof target === 'string' && target ? target : null;
  }

  const targetQueryRoutes = new Set([
    '/targets', '/runs', '/held', '/queue', '/health-fields', '/blast',
    '/blast/retraction', '/brake', '/reports/diff', '/reports/incidents',
  ]);
  if (targetQueryRoutes.has(path) && request.method === 'GET') {
    return url.searchParams.get('target') || null;
  }
  return null;
}

const unauthorized = (): Response => Response.json(
  { error: 'unauthorized', detail: 'Send Authorization: Bearer <api key>.' },
  { status: 401, headers: { 'WWW-Authenticate': 'Bearer' } },
);

/**
 * Verify the bearer key itself. Shared by `requireKey()` (REST) and
 * `requireKeyForMcp()` (MCP-over-HTTP) -- both need the same "is this a real,
 * live key" answer, and differ only in HOW they decide what a scoped key is
 * allowed to touch, because an MCP call carries no HTTP verb that means
 * anything (every tool call is a POST) and no URL path that names a target
 * (every tool call is the same URL).
 */
async function verifyRequest(
  request: Request,
): Promise<{ ok: true; verified: NonNullable<Awaited<ReturnType<typeof verifyKey>>> } | { ok: false; response: Response }> {
  const key = bearerFrom(request);
  const verified = key ? await verifyKey(key) : null;
  if (!verified) return { ok: false, response: unauthorized() };
  return { ok: true, verified };
}

/** Guard a route. Returns null when authorised, or the refusal Response. */
export async function requireKey(request: Request, ctx?: RouteCtx): Promise<Response | null> {
  const check = await verifyRequest(request);
  if (!check.ok) return check.response;
  const { verified } = check;
  if (verified.scope == null) return null;       // exact legacy behavior

  const needed = request.method === 'GET' || request.method === 'HEAD' ? 'read' : 'write';
  if (needed === 'write' && verified.scope.access !== 'write') return forbidden();
  const target = await scopedTarget(request, ctx);
  if (!target || !verified.scope.targets.includes(target)) return forbidden();
  return null;
}

/**
 * The MCP tools whose call actually changes something. Everything else is
 * `read`, INCLUDING `assay_field_health` -- it recomputes and persists, but
 * so does its REST twin `/api/v1/health-fields`, which `scopedTarget()` above
 * already treats as a GET. Same precedent, same answer here.
 */
const MCP_WRITE_TOOLS = new Set([
  'assay_propose', 'assay_create_watch', 'assay_pause_watch', 'assay_delete_watch',
]);

/** A target this tool call could ever be scoped to, `'ANY'` for a tool that touches no stored target data, or null for neither. */
async function mcpTarget(name: string, args: Record<string, unknown>): Promise<string | 'ANY' | null> {
  switch (name) {
    // Target is the whole point of the call, and required by the tool's own
    // schema -- if a caller omitted it the tool itself would already refuse.
    case 'assay_blast_radius':
    case 'assay_heal_history':
    case 'assay_contract':
    case 'assay_contract_history':
    case 'assay_diff':
    case 'assay_pause_watch':
    case 'assay_delete_watch':
    // Optional in the schema, but only a PROVIDED target is checkable --
    // omitting it means "every target", which a scoped key can never mean.
    case 'assay_status':
    case 'assay_runs':
    case 'assay_field_health':
    case 'assay_field_health_stored':
    case 'assay_incidents':
      return typeof args.target === 'string' && args.target ? args.target : null;

    // Indirect ids, resolved the same way the REST routes over the same ids
    // already do -- `/api/v1/rows/:proof`, `/api/v1/explain/:proof`,
    // `/api/v1/reports/incidents/:episode`.
    case 'assay_explain':
    case 'assay_propose':
    case 'assay_score_nomination':
      return typeof args.proof === 'string' ? targetForProof(args.proof) : null;
    case 'assay_incident':
      return args.episode != null ? targetForEpisode(String(args.episode)) : null;

    // Touches no stored target data at all -- drafts a contract and returns
    // it; core.ts's own header states it "does not write to the store". A key
    // scoped to one target cannot leak or mutate a fact about any other by
    // calling this one.
    case 'assay_watch':
      return 'ANY';

    // Every remaining tool either has no target argument at all
    // (assay_held, assay_decisions, assay_brakes, assay_connectors,
    // assay_model_status, assay_skills, assay_targets, assay_digest,
    // assay_create_watch) or, like assay_blast in core.ts, takes only a field
    // name that is not unique to one target -- there is no id here a scoped
    // key could ever be checked against, the same as their nearest REST
    // equivalent (where one exists) already refuses a scoped key outright.
    default:
      return null;
  }
}

/**
 * The MCP-over-HTTP guard (`web/app/api/mcp/route.ts`). Every call arrives as
 * a POST regardless of which tool it invokes, so `requireKey()`'s HTTP-verb
 * and URL-path reasoning has nothing to read here -- `rpc` is the parsed
 * JSON-RPC body instead, and everything this function decides comes from it.
 *
 * `initialize`, `tools/list` and every other non-`tools/call` method are
 * always allowed for a scoped key: they carry no target-specific data, only
 * this server's own static tool descriptions.
 */
export async function requireKeyForMcp(
  request: Request,
  rpc: { method?: unknown; params?: { name?: unknown; arguments?: unknown } },
): Promise<Response | null> {
  const check = await verifyRequest(request);
  if (!check.ok) return check.response;
  const { verified } = check;
  if (verified.scope == null) return null;       // exact legacy behavior

  if (rpc.method !== 'tools/call') return null;

  const name = typeof rpc.params?.name === 'string' ? rpc.params.name : '';
  const args = (rpc.params?.arguments && typeof rpc.params.arguments === 'object'
    ? rpc.params.arguments : {}) as Record<string, unknown>;

  if (MCP_WRITE_TOOLS.has(name) && verified.scope.access !== 'write') return forbidden();

  const target = await mcpTarget(name, args);
  if (target === 'ANY') return null;
  if (!target || !verified.scope.targets.includes(target)) return forbidden();
  return null;
}
