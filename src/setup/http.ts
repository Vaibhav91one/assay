// The setup REST surface, as plain functions. Route files under
// `web/app/api/v1/targets/` stay thin wrappers so this is testable without
// booting Next -- the same shape `src/api/handlers.ts` and `src/ai/http.ts` use.
//
// A Server Action skips all of it and calls `src/setup/index.ts` directly.

import { z } from 'zod';
import { requireKey } from '../api/keys.js';
import {
  CreateInput, createTarget, listTargets, showTarget,
  pauseTarget, resumeTarget, deleteTarget, type SetupError,
} from './index.js';

type RouteCtx = { params: Promise<Record<string, string>> };
type Handler = (request: Request, ctx: RouteCtx) => Promise<Response>;

const STATUS: Record<SetupError, number> = {
  not_found: 404,
  already_exists: 409,
  has_history: 409,
  not_schedulable: 409,
  unreachable: 502,
  no_element: 422,
};

/**
 * Say what was wrong with the body, in words the caller can act on.
 *
 * Zod 4's messages come from a locale table that Next 16's production bundle
 * does not carry, so the same rejected body reads in full in-process and a bare
 * `Invalid input` over HTTP (WAVE2-LEDGER 5). The detail is rebuilt from each
 * issue's `code`, `path`, `keys` and `values`, which are data and survive
 * bundling. `prettifyError` is included as well because it is the one line a
 * human actually reads.
 *
 * Exported: `src/agent/http.ts` is the same boundary with the same problem, and
 * two copies of this would drift into two different 400 bodies.
 */
export const badRequest = (err: z.ZodError): Response =>
  Response.json(
    {
      error: 'bad_request',
      issues: err.issues.map((i) => ({
        path: i.path.join('.') || '(root)',
        code: i.code,
        ...('expected' in i ? { expected: i.expected } : {}),
        ...('keys' in i ? { keys: i.keys } : {}),
        ...('values' in i ? { values: i.values } : {}),
      })),
      detail: z.prettifyError(err),
    },
    { status: 400 },
  );

export const parseBody = async <S extends z.ZodType>(
  request: Request,
  schema: S,
): Promise<{ ok: true; data: z.infer<S> } | { ok: false; response: Response }> => {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return {
      ok: false,
      response: Response.json({ error: 'bad_request', detail: 'Body is not JSON.' }, { status: 400 }),
    };
  }
  const parsed = schema.safeParse(raw);
  return parsed.success
    ? { ok: true, data: parsed.data }
    : { ok: false, response: badRequest(parsed.error) };
};

/** Guard, run, and never let a driver error reach a consumer. */
export const guarded = (fn: Handler): Handler => async (request, ctx) => {
  const denied = await requireKey(request);
  if (denied) return denied;
  try {
    return await fn(request, ctx);
  } catch (e) {
    // A drizzle error names tables, columns and the parameters it was given.
    console.error('[setup]', (e as Error).message);
    return Response.json({ error: 'internal' }, { status: 500 });
  }
};

/** Map a plain result onto a status code. `ok` is the only success shape. */
const send = (r: { ok: true } | { ok: false; error: SetupError }): Response =>
  r.ok ? Response.json(r) : Response.json(r, { status: STATUS[r.error] });

const idFrom = async (ctx: RouteCtx): Promise<string> => (await ctx.params).target;

/** GET /api/v1/targets -- everything under watch. */
export const getTargets = guarded(async () => Response.json(await listTargets()));

/** POST /api/v1/targets -- create a watch and establish its baseline. */
export const postTargets = guarded(async (request) => {
  const body = await parseBody(request, CreateInput);
  if (!body.ok) return body.response;
  const r = await createTarget(body.data);
  return r.ok ? Response.json(r, { status: 201 }) : send(r);
});

/** GET /api/v1/targets/:target -- one target, with its run and held counts. */
export const getTarget = guarded(async (_request, ctx) => send(await showTarget(await idFrom(ctx))));

/** DELETE /api/v1/targets/:target -- only ever a target that never ran. */
export const deleteTargetRoute = guarded(async (_request, ctx) =>
  send(await deleteTarget(await idFrom(ctx))));

/** POST /api/v1/targets/:target/pause -- stop running it, keep the cadence. */
export const postPause = guarded(async (_request, ctx) => send(await pauseTarget(await idFrom(ctx))));

/** POST /api/v1/targets/:target/resume -- due immediately, not one cadence from now. */
export const postResume = guarded(async (_request, ctx) => send(await resumeTarget(await idFrom(ctx))));
