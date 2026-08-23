// REST for contracts. Route files under web/ stay thin wrappers so this is
// testable without booting Next, matching src/api/handlers.ts.
//
// The write is deliberately narrow: POST appends a version, and there is no
// PUT and no DELETE. A settings endpoint that mutates has no diff, no review
// and no revert, and policy is the last thing that should be editable without
// one -- docs/FEATURES.md 5, "credentials get pixels, policy gets a PR".

import { z } from 'zod';
import { requireKey } from '../api/keys.js';
import { thresholdsFor } from './index.js';
import {
  contractHistory, contractVersion, latestContract, saveContract,
  type ContractVersion,
} from './store.js';

// The Next route-handler shape, named rather than imported: `src/` must not
// take a dependency on next to describe two parameters. Same reasoning, and
// the same `Promise<any>`, as src/api/handlers.ts -- Next type-checks each
// route against ITS own params and no single concrete type satisfies all.
// TODO(types): see above; narrowing happens per handler, where the route is known.
type RouteCtx = { params: Promise<any> };
type Handler = (request: Request, ctx: RouteCtx) => Promise<Response>;

const guarded = (fn: Handler): Handler => async (request, ctx) => {
  const denied = await requireKey(request, ctx);
  if (denied) return denied;
  try {
    return await fn(request, ctx);
  } catch (e) {
    // Never leak a driver error to a consumer; it can name tables and columns.
    console.error('[contracts]', (e as Error).message);
    return Response.json({ error: 'internal' }, { status: 500 });
  }
};

const asJson = (v: ContractVersion) => ({
  target: v.targetId,
  version: v.version,
  created_at: v.createdAt,
  // Byte for byte what the operator wrote. The parsed form is derived; this is
  // the thing they are accountable for.
  yaml: v.yaml,
  parsed: v.parsed,
  thresholds: Object.fromEntries(
    Object.keys(v.parsed.fields).map((f) => [f, thresholdsFor(v.parsed, f)]),
  ),
});

const PostBody = z.strictObject({ yaml: z.string().min(1) });

/** POST /api/v1/contracts -- append a version. 422 carries the line to fix. */
export const postContract = guarded(async (request) => {
  const body = PostBody.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    // Written out rather than taken from the issue: Zod 4's default messages
    // live in a locale module that Next's production bundle drops, so
    // `issue.message` reads "Invalid input" over HTTP. Same reason as
    // EXPLAIN in src/contracts/index.ts.
    return Response.json(
      { error: 'invalid_request', detail: 'The body must be {"yaml": "<the contract>"} and nothing else.' },
      { status: 400 },
    );
  }

  const saved = await saveContract(body.data.yaml, { checkFields: true });
  if (!saved.ok) {
    return Response.json({ error: 'invalid_contract', issues: saved.issues }, { status: 422 });
  }
  return Response.json(asJson(saved.version), { status: 201 });
});

/**
 * GET /api/v1/contracts/:target        -- the contract in force
 * GET /api/v1/contracts/:target?version=n  -- that exact version
 * GET /api/v1/contracts/:target?history=1  -- every version, newest first
 */
export const getContract = guarded(async (request, ctx) => {
  // Next hands params through untyped, which makes it a boundary like any other.
  const target = z.string().min(1).safeParse((await ctx.params).target);
  if (!target.success) {
    return Response.json(
      { error: 'invalid_request', detail: 'A target id is required.' },
      { status: 400 },
    );
  }
  const url = new URL(request.url);

  if (url.searchParams.get('history') === '1') {
    const all = await contractHistory(target.data);
    return Response.json({ target: target.data, versions: all.map(asJson) });
  }

  const raw = url.searchParams.get('version');
  if (raw !== null) {
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 1) {
      return Response.json(
        { error: 'invalid_request', detail: 'version must be a positive integer.' },
        { status: 400 },
      );
    }
    const v = await contractVersion(target.data, n);
    return v
      ? Response.json(asJson(v))
      : Response.json({ error: 'not_found', detail: `No version ${n} for "${target.data}".` }, { status: 404 });
  }

  const v = await latestContract(target.data);
  // No contract is not an error, and it is not an empty contract either: it is
  // the engine's own thresholds, which is a real answer to "what governs this
  // target". The absence is stated rather than filled in.
  return v
    ? Response.json(asJson(v))
    : Response.json({ target: target.data, version: null, yaml: null, parsed: null, thresholds: {} });
});
