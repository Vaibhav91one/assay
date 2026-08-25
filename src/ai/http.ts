// The AI REST surface, as plain functions. Route files under
// `web/app/api/v1/ai/` stay thin wrappers so this is testable without booting
// Next -- the same shape `src/api/handlers.ts` uses for the read-only surface.
//
// `POST /nominate` used to score a nomination against the ranked list
// `healGated` persisted when the gate abstained. It is gone along with
// `assay_propose`/`assay_score_nomination`: `healGated` no longer runs
// (`src/runner.ts`'s header), so there is never a ranked list to score a
// nomination against.

import { z } from 'zod';
import { requireKey } from '../api/keys.js';
import { hasKey, rankDiscovery } from './index.js';

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
