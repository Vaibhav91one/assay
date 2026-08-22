// The REST surface for reports, as plain functions so it is testable without
// booting Next. Same shape as src/api/handlers.ts, and read-only for the same
// reason: nothing in this feature writes except the digest claim, which is the
// worker's, not a consumer's.

import { z } from 'zod';
import { requireKey } from '../api/keys.js';
import { incidentRecord, episodes } from './incident.js';
import { fieldHistory } from './diff.js';
import { composeDigest } from './digest.js';
import { incidentMarkdown } from './render.js';

// Next generates a per-route type check against that route's own params, so a
// single concrete type cannot satisfy every route. Narrowing happens in each
// handler, where the route is known -- the same call the existing surface makes.
type RouteCtx = { params: Promise<any> };   // TODO(types): see src/api/handlers.ts
type Handler = (request: Request, ctx: RouteCtx) => Promise<Response>;

/**
 * A 400 built from the issue's structure, not its message.
 *
 * Zod 4's locale strings are dropped by Next 16's production bundle, so
 * `issue.message` reads "Invalid input" over HTTP however good it looks in
 * process. `path`, `code` and `expected` survive, so the detail is assembled
 * from those -- a consumer needs to know WHICH parameter, and no build step can
 * tree-shake that away.
 */
const badRequest = (e: z.ZodError): Response => Response.json({
  error: 'bad_request',
  detail: e.issues.map((i) => {
    const where = i.path.length ? i.path.join('.') : 'query';
    const expected = 'expected' in i ? `, expected ${String(i.expected)}` : '';
    return `${where}: ${i.code}${expected}`;
  }).join('; '),
}, { status: 400 });

const guarded = (fn: Handler): Handler => async (request, ctx) => {
  const denied = await requireKey(request);
  if (denied) return denied;
  try {
    return await fn(request, ctx);
  } catch (e) {
    if (e instanceof z.ZodError) return badRequest(e);
    // A driver error names tables and columns; a consumer never sees one.
    console.error('[reports]', (e as Error).message);
    return Response.json({ error: 'internal' }, { status: 500 });
  }
};

const notFound = (what: string): Response =>
  Response.json({ error: 'not_found', detail: `No ${what} with that id.` }, { status: 404 });

const Limit = z.coerce.number().int().min(1).max(1000);

const EpisodeId = z.coerce.number().int().positive();

const DiffQuery = z.object({
  target: z.string().min(1),
  field: z.string().min(1),
  limit: Limit.optional(),
});

// A window is two instants. Neither is defaulted here: "this week" is a
// decision the caller makes, and inventing one would put a made-up period in a
// document whose whole claim is that it invents nothing.
//
// The ordering is checked in the handler rather than by `.refine`, because a
// refinement's only signal is `code: "custom"` once its message is bundled away.
const DigestQuery = z.object({ since: z.coerce.date(), until: z.coerce.date() });

const query = (request: Request): Record<string, string> =>
  Object.fromEntries(new URL(request.url).searchParams);

/** GET /api/v1/reports/incidents?target=&limit= -- the episodes there are. */
export const getIncidents = guarded(async (request) => {
  const q = z.object({ target: z.string().min(1).optional(), limit: Limit.optional() })
    .parse(query(request));
  return Response.json({ incidents: await episodes({ targetId: q.target, limit: q.limit }) });
});

/**
 * GET /api/v1/reports/incidents/:episode -- the record (F14).
 *
 * `?format=md` returns the sendable file itself rather than JSON, because the
 * artefact IS a file someone forwards. Both are the same composition.
 */
export const getIncident = guarded(async (request, ctx) => {
  const { episode } = await ctx.params;
  const record = await incidentRecord(EpisodeId.parse(episode));
  if (!record) return notFound('episode');

  if (new URL(request.url).searchParams.get('format') === 'md') {
    return new Response(incidentMarkdown(record), {
      headers: { 'content-type': 'text/markdown; charset=utf-8' },
    });
  }
  return Response.json(record);
});

/** GET /api/v1/reports/diff?target=&field= -- value history, holes included. */
export const getDiff = guarded(async (request) => {
  const q = DiffQuery.parse(query(request));
  return Response.json(await fieldHistory(
    { targetId: q.target, field: q.field, limit: q.limit },
  ));
});

/** GET /api/v1/reports/digest?since=&until= -- composed, never sent. */
export const getDigest = guarded(async (request) => {
  const w = DigestQuery.parse(query(request));
  if (!(w.since < w.until)) {
    return Response.json(
      { error: 'bad_request', detail: 'since must be before until' }, { status: 400 });
  }
  return Response.json(await composeDigest(w));
});
