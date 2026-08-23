// The AI REST surface, as plain functions. Route files under
// `web/app/api/v1/ai/` stay thin wrappers so this is testable without booting
// Next -- the same shape `src/api/handlers.ts` uses for the read-only surface.
//
// Nothing here writes. `POST /nominate` scores a nomination and returns what the
// gate would say; recording a nomination is still `assay_propose`'s job and
// resolving one is still nobody's.

import { z } from 'zod';
import { requireKey } from '../api/keys.js';
import { explain } from '../store/index.js';
import { hasKey, scoreNomination, rankDiscovery, type RankedCandidate } from './index.js';

type RouteCtx = { params: Promise<any> };
type Handler = (request: Request, ctx: RouteCtx) => Promise<Response>;

const guarded = (fn: Handler): Handler => async (request, ctx) => {
  const denied = await requireKey(request, ctx);
  if (denied) return denied;
  try {
    return await fn(request, ctx);
  } catch (e) {
    console.error('[ai]', (e as Error).message);
    return Response.json({ error: 'internal' }, { status: 500 });
  }
};

/**
 * Zod 4's locale error messages are dropped by Next's production bundle, so a
 * rejected body would read a bare "Invalid input" over HTTP while reading in
 * full in-process. That is unacceptable here specifically: this schema is the
 * structural guard against a model emitting a value, and a rejection that
 * cannot say why makes an injection attempt indistinguishable from a schema
 * bug. Details are rebuilt from each issue's `code` and `path`, which survive
 * bundling because they are data rather than locale strings.
 */
const badRequest = (err: z.ZodError): Response =>
  Response.json(
    {
      error: 'bad_request',
      issues: err.issues.map((i) => ({
        path: i.path.join('.') || '(root)',
        code: i.code,
        ...('expected' in i ? { expected: i.expected } : {}),
        // `keys` names the rejected extra fields -- which is the whole content
        // of an `unrecognized_keys` issue, and the half a bundled locale string
        // drops. This is how a caller learns that "value" was refused.
        ...('keys' in i ? { keys: i.keys } : {}),
        ...('values' in i ? { values: i.values } : {}),
      })),
      detail: z.prettifyError(err),
    },
    { status: 400 },
  );

const parseBody = async <S extends z.ZodType>(
  request: Request,
  schema: S,
): Promise<{ ok: true; data: z.infer<S> } | { ok: false; response: Response }> => {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return { ok: false, response: Response.json({ error: 'bad_request', detail: 'Body is not JSON.' }, { status: 400 }) };
  }
  const parsed = schema.safeParse(raw);
  return parsed.success ? { ok: true, data: parsed.data } : { ok: false, response: badRequest(parsed.error) };
};

/** GET /api/v1/ai/status -- is a model configured? Presence only, never the key. */
export const getStatus = guarded(async () =>
  Response.json({
    model_configured: hasKey(),
    // The closed set, not a number. FEATURES.md 4 refuses a confidence percentage.
    degrades_to: hasKey() ? null : {
      field_inference: 'unavailable',
      discovery_ranking: 'lexical',
      nomination_scoring: 'unaffected',
    },
  }));

const NominateBody = z.object({
  proof: z.string().min(1),
  candidate_index: z.int().min(0),
  // An index or an explicit null ("none of these"). Absent means not consulted,
  // which is a third state and not the same as either.
  model_pick: z.int().min(0).nullable().optional(),
  tau: z.number().min(0).max(1).optional(),
  delta: z.number().min(0).max(1).optional(),
}).strict();

/**
 * POST /api/v1/ai/nominate -- what would the gate say about this candidate?
 *
 * Read-only by construction: it scores the ranked list persisted when the gate
 * abstained and returns `decision: null`. Re-fetching the page would score a
 * different page and be silently wrong (CRITIQUE 2.4).
 */
export const postNominate = guarded(async (request) => {
  const body = await parseBody(request, NominateBody);
  if (!body.ok) return body.response;

  const x = await explain(body.data.proof);
  if (!x) return Response.json({ error: 'not_found', detail: 'No held cell with that proof.' }, { status: 404 });
  if (x.status !== 'quarantined') {
    return Response.json({ error: 'not_held', detail: `That cell is ${x.status}, not held.` }, { status: 409 });
  }

  const ranked = (x.ranked ?? []) as RankedCandidate[];
  return Response.json({
    proof: body.data.proof,
    ...scoreNomination(ranked, body.data.candidate_index, {
      tau: body.data.tau,
      delta: body.data.delta,
      modelPick: 'model_pick' in body.data ? body.data.model_pick : undefined,
    }),
  });
});

const DiscoverBody = z.object({
  intent: z.string().min(1).max(500),
  targets: z.array(z.object({ label: z.string().min(1).max(500) }).loose()).min(1).max(100),
}).strict();

/**
 * POST /api/v1/ai/discover -- order candidate targets by operator intent.
 *
 * Always answers, and always says whether the ordering came from a model or from
 * word overlap. A caller that ignores `source` cannot tell them apart, which is
 * why it is a field and not a footnote.
 */
export const postDiscover = guarded(async (request) => {
  const body = await parseBody(request, DiscoverBody);
  if (!body.ok) return body.response;
  return Response.json(await rankDiscovery(body.data.targets, body.data.intent));
});
