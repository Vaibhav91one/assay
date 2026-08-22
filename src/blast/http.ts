// The REST half of F6/F9, as plain functions. Route files stay thin wrappers,
// the same way src/api/handlers.ts does it, so this is testable without Next.
//
// GET never writes. Computing a window is a read; filing a retraction is an
// operator saying "this happened", and that takes a POST -- a warehouse polling
// the CSV must not be able to file eleven retractions by refreshing.

import { z } from 'zod';
import { requireKey } from '../api/keys.js';
import {
  blastRadius, recordRetraction, markExported, retractionCsv, rescrapeList,
  BlastError, BlastQuery,
} from './index.js';

type Handler = (request: Request) => Promise<Response>;

const STATUS: Record<BlastError['code'], number> = {
  no_such_target: 404,
  no_history: 404,
  no_such_run: 400,
  no_such_cell: 404,
};

const guarded = (fn: Handler): Handler => async (request) => {
  const denied = await requireKey(request);
  if (denied) return denied;
  try {
    return await fn(request);
  } catch (e) {
    if (e instanceof BlastError) {
      return Response.json({ error: e.code, detail: e.message }, { status: STATUS[e.code] });
    }
    if (e instanceof z.ZodError) {
      // Zod 4's messages are locale strings that Next's production bundle drops,
      // so a body that reads "expected number, received string" in process
      // arrives as a bare "Invalid input" over HTTP. Build the detail from the
      // issue codes, which survive.
      return Response.json({
        error: 'bad_request',
        detail: z.prettifyError(e),
        issues: e.issues.map((i) => ({ code: i.code, path: i.path.join('.') })),
      }, { status: 400 });
    }
    // Never leak a driver error to a consumer; it can name tables and columns.
    console.error('[blast]', (e as Error).message);
    return Response.json({ error: 'internal' }, { status: 500 });
  }
};

// A run id arriving as a query string is a string. Coerce here, at the edge,
// and refuse anything that is not a positive integer rather than defaulting it.
const runParam = z.coerce.number().int().positive().optional();
const Query = BlastQuery.omit({ at_run: true, from_run: true })
  .extend({ at_run: runParam, from_run: runParam });

const queryOf = (request: Request): BlastQuery => {
  const p = new URL(request.url).searchParams;
  return Query.parse({
    target: p.get('target') ?? undefined,
    field: p.get('field') ?? undefined,
    at_run: p.get('at_run') ?? undefined,
    from_run: p.get('from_run') ?? undefined,
  });
};

/** GET /api/v1/blast?target=&field=&at_run=&from_run= -- the window (F6). */
export const getBlast = guarded(async (request) => {
  const w = await blastRadius(queryOf(request));
  return Response.json({ ...w, rescrape: await rescrapeList(w) });
});

/** GET /api/v1/blast/retraction?...&format=csv -- the list, without filing it. */
export const getRetraction = guarded(async (request) => {
  const w = await blastRadius(queryOf(request));
  if (new URL(request.url).searchParams.get('format') !== 'csv') {
    return Response.json({
      target: w.target, field: w.field,
      from_run: w.first_suspect_run, to_run: w.detected_run,
      row_ids: w.rows.map((r) => r.proof),
      bounded: w.bounded, caveats: w.caveats,
    });
  }
  return new Response(await retractionCsv(w), {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition':
        `attachment; filename="${w.target}-${w.field}-${w.first_suspect_run}-${w.detected_run}.csv"`,
    },
  });
});

const PostBody = BlastQuery.extend({ exported: z.boolean().optional() });

/** POST /api/v1/blast/retraction -- file it. `exported` records that it left. */
export const postRetraction = guarded(async (request) => {
  const body = PostBody.parse(await request.json());
  const w = await blastRadius(body);
  const r = await recordRetraction(w);
  const exportedAt = body.exported ? await markExported(r.retraction_id) : r.exported_at;
  return Response.json({
    retraction_id: r.retraction_id,
    created: r.created,
    from_run: w.first_suspect_run,
    to_run: w.detected_run,
    rows: w.rows.length,
    bounded: w.bounded,
    // null means computed but not yet acted on. It is not a zero.
    exported_at: exportedAt,
  }, { status: r.created ? 201 : 200 });
});
