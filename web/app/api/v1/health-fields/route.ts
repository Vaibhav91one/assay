// GET /api/v1/health-fields -- standing per-field health (F1 fragility, F3 drift).
//
// NOT /api/health. That route is the deployment liveness probe and answers a
// completely different question; the two share a word and nothing else.
//
// Read-only, like the rest of /api/v1: this returns the state already on
// record, and recomputing it is a write that belongs to the CLI, the MCP tool
// and (in wave 2) the worker. `field_state` exists exactly so a screen does not
// recompute a trend on every read -- src/store/schema.ts says so.

import { z } from 'zod';
import { requireKey } from 'assay/api/keys';
import { standingState } from 'assay/engine/health/observe';
import { FRAGILITY_GRADES, DRIFT_STATES } from 'assay/engine/health/index';

export const dynamic = 'force-dynamic';

/**
 * The one query parameter, parsed rather than read.
 *
 * An empty `?target=` is an absence, not a target named "". Coercing it would
 * scope the query to a target that cannot exist and return an empty list that
 * reads as "nothing is fragile".
 */
const Query = z.object({ target: z.string().min(1).max(200).nullable() });

export async function GET(request: Request) {
  const denied = await requireKey(request);
  if (denied) return denied;

  const parsed = Query.safeParse({
    target: new URL(request.url).searchParams.get('target') || null,
  });
  if (!parsed.success) {
    // `error.message` is Zod 4's localized string, and Next 16's production
    // bundle drops the locale -- a caller would get a bare "Invalid input"
    // from the deployed build and a useful one from `next dev`, which is the
    // worst of both. `prettifyError` is built from the issue itself.
    return Response.json(
      { error: 'bad_request', detail: z.prettifyError(parsed.error) },
      { status: 400 },
    );
  }

  try {
    return Response.json({
      // The closed sets, shipped with the data. A consumer branching on these
      // words needs to know what the whole vocabulary is, and an undeclared
      // enum is how a fifth state reaches production as an unhandled string.
      vocabularies: { fragility_grade: FRAGILITY_GRADES, drift_state: DRIFT_STATES },
      fields: await standingState(parsed.data.target),
    });
  } catch (e) {
    // Never leak a driver error to a consumer; it can name tables and columns.
    console.error('[health-fields]', (e as Error).message);
    return Response.json({ error: 'internal' }, { status: 500 });
  }
}
