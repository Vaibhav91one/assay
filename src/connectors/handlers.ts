// The connector surface, as plain functions. Route files stay thin wrappers so
// this is testable without booting Next -- the same shape `src/api/handlers.ts`
// uses, for the same reason.
//
// Two different authentications live here, deliberately:
//
//   * The CONFIG endpoints take an Assay API key, like every other v1 route.
//   * The DELIVERY endpoint takes the Bright Data bearer instead, because the
//     caller is Bright Data and it has no Assay key. It is not unauthenticated:
//     it is authenticated as a different principal, and `receive` fails closed
//     when no connector is configured.
//
// Nothing here ever puts a secret in a response body. `put` and `describe`
// return `Presence`, which has nowhere to hold one.

import { requireKey } from '../api/keys.js';
import { markNotified } from '../store/index.js';
import { KINDS, CONFIG_SCHEMA, describe, put, remove, issueDetail, type Kind } from './config.js';
import { receive, authorise, DeliveryError } from './brightdata.js';
import { announce, summarise, breakMessage, testMessage } from './deliver.js';

type RouteCtx = { params: Promise<any> };
type Handler = (request: Request, ctx: RouteCtx) => Promise<Response>;

const bad = (code: string, detail: string, status = 400): Response =>
  Response.json({ error: code, detail }, { status });

/** Wrap a handler in the API-key guard so no config route can forget it. */
const guarded = (fn: Handler): Handler => async (request, ctx) => {
  try {
    // Inside the try, for the reason src/api/handlers.ts states: `requireKey`
    // hits Postgres, and a driver error raised while checking the key escaped
    // the wrapper that exists to keep exactly that out of a response.
    const denied = await requireKey(request, ctx);
    if (denied) return denied;
    return await fn(request, ctx);
  } catch (e) {
    // Never echo the caught error to the client: a config error can carry the
    // value that failed validation, and that value is the secret.
    console.error('[connectors]', (e as Error).message);
    return Response.json({ error: 'internal' }, { status: 500 });
  }
};

const asKind = (v: unknown): Kind | null =>
  (KINDS as readonly string[]).includes(v as string) ? (v as Kind) : null;

/** GET /api/v1/connectors -- presence for all three. Never a value. */
export const getConnectors = guarded(async () =>
  Response.json({ connectors: await describe() }));

/** PUT /api/v1/connectors/:kind -- store one connector's credentials. */
export const putConnector = guarded(async (request, ctx) => {
  const kind = asKind((await ctx.params).kind);
  if (!kind) return bad('unknown_kind', `kind must be one of: ${KINDS.join(', ')}`, 404);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return bad('unparseable', 'body is not valid JSON');
  }

  const parsed = CONFIG_SCHEMA[kind].safeParse(body);
  if (!parsed.success) {
    // Paths, codes and messages only. `z.treeifyError` and friends can include
    // the received value, which here is the credential. The code is carried
    // because the message alone does not survive a production bundle -- see
    // `issueDetail`.
    return Response.json(
      { error: 'invalid_config', issues: parsed.error.issues.map(issueDetail) },
      { status: 400 },
    );
  }

  return Response.json(await put(kind, parsed.data));
});

/** DELETE /api/v1/connectors/:kind -- forget it. Idempotent. */
export const deleteConnector = guarded(async (_request, ctx) => {
  const kind = asKind((await ctx.params).kind);
  if (!kind) return bad('unknown_kind', `kind must be one of: ${KINDS.join(', ')}`, 404);
  return Response.json(await remove(kind));
});

/**
 * POST /api/v1/connectors/:kind/delivery/:target -- a Bright Data delivery.
 *
 * Reads the body as bytes, not as text: the delivery is gzipped by default and
 * `request.text()` would hand `decodeDelivery` mojibake instead of a gzip
 * header. Bright Data retries anything that is not a 200 within 30 seconds, so
 * the status codes here decide whether a bad delivery is retried forever.
 */
export async function postDelivery(request: Request, ctx: RouteCtx): Promise<Response> {
  const { kind, target } = await ctx.params;
  if (kind !== 'brightdata') {
    return bad('unknown_kind', 'only the brightdata connector receives deliveries', 404);
  }
  try {
    // BEFORE the body is read. Buffering an arbitrarily large body from an
    // unauthenticated caller and only then checking the bearer would make this
    // endpoint a memory-exhaustion primitive for anyone who knows the URL.
    await authorise(request.headers.get('authorization'));

    const body = Buffer.from(await request.arrayBuffer());
    const result = await receive({ targetId: String(target), body });

    // A break announcement is a separate fact from the run record, so it
    // happens here rather than inside the shared pipeline -- the run a webhook
    // produces has to be identical to the one a local fetch produces.
    const { announcement, ...body_ } = result;
    let announced: string | undefined;
    if (announcement && result.episode !== null) {
      // The run is already committed. An announcement that cannot be sent, or
      // a note that cannot be written, must not turn a recorded run into a 500
      // -- Bright Data retries every non-200, and the retry would be refused as
      // a replay, so the job would fail for ever over a chat message.
      try {
        // `announce` REPORTS a dead connector, it does not throw for one: a
        // Discord 500 comes back as a result with `ok: false`, and no connector
        // configured comes back as an empty array. So "did the alert go out" is
        // a question about the results and not about whether this line threw.
        const rs = await announce(breakMessage(announcement));
        announced = summarise(rs);
        if (!rs.some((r) => r.ok)) announced = `undelivered: ${announced}`;
      } catch (e) {
        announced = `undelivered: ${(e as Error).message}`;
        console.error('[connectors] announcement failed', (e as Error).message);
      }
      // A bounced alert is an unread break, so how it went -- or did not -- is
      // stored on the episode rather than left in a log line. BOTH outcomes:
      // the Activity badge raises `undelivered` by reading this column
      // (`web/lib/notifications.ts`), and while the failing branch wrote
      // nothing the column stayed null, so the one delivery an operator most
      // needed to hear about was the one the badge could never show. The
      // fetched path already does this (`notifyBreak` in `tools/worker.ts`);
      // the two now record the same failure the same way.
      //
      // Wrapped for the reason the block above is wrapped: the run is committed,
      // and a note that cannot be written must not turn it into a 500.
      try {
        await markNotified(result.episode, announced);
      } catch (e) {
        console.error('[connectors] could not record the announcement', (e as Error).message);
      }
    }
    return Response.json({ ...body_, ...(announced ? { announced } : {}) });
  } catch (e) {
    if (e instanceof DeliveryError) {
      // Logged without the body: an unauthorised delivery is exactly the thing
      // whose contents should not end up in a log file.
      console.warn(`[connectors] delivery refused: ${e.code}`);
      return Response.json({ error: e.code, detail: e.message }, { status: e.status });
    }
    console.error('[connectors]', (e as Error).message);
    return Response.json({ error: 'internal' }, { status: 500 });
  }
}

/**
 * Send one message to every configured chat connector and report what happened.
 *
 * Returns 502 when any delivery failed. A test that answers 200 while Discord
 * answered 404 is worse than no test at all -- it certifies a dead endpoint.
 */
export const postTest = guarded(async () => {
  const results = await announce(testMessage());
  const failed = results.filter((r) => !r.ok);
  return Response.json(
    { delivered: results, summary: summarise(results) },
    { status: failed.length ? 502 : 200 },
  );
});
