// The read-only surface, as plain functions.
//
// Route files stay thin wrappers so this logic is testable without booting
// Next. Read-only by construction: nothing here writes.

import { requireKey } from './keys.js';
import { rowByProof, heldCells, runsFor, openQueue, explain } from '../store/index.js';

// The Next route-handler shape, named here rather than imported: `src/` is
// engine-side and must not take a dependency on next just to describe two
// parameters. Route files stay thin wrappers over these functions.
type RouteCtx = { params: Promise<Record<string, string>> };
type Handler = (request: Request, ctx: RouteCtx) => Promise<Response>;

const notFound = (what: string): Response =>
  Response.json({ error: 'not_found', detail: `No ${what} with that id.` }, { status: 404 });

/** Wrap a handler in the auth guard so no route can forget it. */
const guarded = (fn: Handler): Handler => async (request, ctx) => {
  const denied = await requireKey(request);
  if (denied) return denied;
  try {
    return await fn(request, ctx);
  } catch (e) {
    // Never leak a driver error to a consumer; it can name tables and columns.
    console.error('[api]', (e as Error).message);
    return Response.json({ error: 'internal' }, { status: 500 });
  }
};

const intParam = (url: URL, name: string, dflt: number, max: number): number => {
  const raw = Number(url.searchParams.get(name));
  return Number.isInteger(raw) && raw > 0 ? Math.min(raw, max) : dflt;
};

/** GET /api/v1/rows/:proof -- the warehouse join, rebuilt from the store. */
export const getRow = guarded(async (_req, { params }) => {
  const { proof } = await params;
  const row = await rowByProof(proof);
  return row ? Response.json(row) : notFound('row');
});

/** GET /api/v1/explain/:proof -- full provenance for one cell (F12). */
export const getExplain = guarded(async (_req, { params }) => {
  const { proof } = await params;
  const x = await explain(proof);
  return x ? Response.json(x) : notFound('proof');
});

/** GET /api/v1/held -- every quarantined cell (F4). */
export const getHeld = guarded(async () =>
  Response.json({ held: await heldCells() }));

/** GET /api/v1/runs?target=&limit= */
export const getRuns = guarded(async (request) => {
  const url = new URL(request.url);
  return Response.json({
    runs: await runsFor(url.searchParams.get('target') || null, intParam(url, 'limit', 50, 500)),
  });
});

/** GET /api/v1/queue -- open decisions the gate refused to make. */
export const getQueue = guarded(async (request) => {
  const url = new URL(request.url);
  return Response.json({ queue: await openQueue(intParam(url, 'limit', 50, 500)) });
});
