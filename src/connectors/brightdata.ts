// The Bright Data delivery receiver.
//
// Verified against docs fetched 2026-08-22:
//   https://docs.brightdata.com/datasets/scrapers/google/data-delivery/webhooks
//   https://docs.brightdata.com/api-reference/web-scraper-api/asynchronous-requests
//   https://docs.brightdata.com/datasets/scrapers/scrapers-library/delivery-options
//
// What those pages establish, and what each one forces here:
//
//   * The body is a JSON ARRAY of record objects -- no envelope, no wrapper.
//   * It is GZIPPED unless the job was triggered with `uncompressed_webhook=true`.
//     This is the default, so a receiver that assumes text is broken on day one.
//   * `format` may be `json`, `ndjson` or `jsonl`, so the array may instead be
//     newline-delimited objects.
//   * The endpoint must answer 200 within 30 seconds or the delivery is retried.
//   * THERE IS NO SIGNATURE. No HMAC, no signing secret, no signature header
//     appears anywhere in Bright Data's documentation. Authenticity rests on an
//     `Authorization` header value THE CUSTOMER supplies at trigger time
//     (`auth_header`, or `webhook_header_Authorization` on the per-scraper
//     trigger) and Bright Data echoes back, plus a published source-IP list.
//
// So this module verifies the bearer Assay minted, in constant time, and says
// plainly in its own report that this is weaker than the signed outbound
// webhook `src/api/webhooks.ts` sends. It is what the vendor offers.
//
//   * There is also no documented snapshot-id or dataset-id header on the
//     delivery, so the target cannot be read out of the request. It comes from
//     the URL path instead -- one endpoint per target, which is what the docs
//     recommend when you need to correlate a delivery.

import { z } from 'zod';
import { gunzipSync } from 'node:zlib';
import { timingSafeEqual, createHash } from 'node:crypto';
import { getDb, sql, targets, eq } from '../store/index.js';
import { secretFor, issueDetail } from './config.js';
import { ingestPage, pageDigest, type TargetRow } from './ingest.js';
import { recordToHtml, isRecord } from './record.js';
import type { Announcement } from './deliver.js';

/** How long after acceptance an identical body is treated as a replay. */
export const REPLAY_WINDOW_SEC = 300;

/**
 * Bright Data's row shape is dataset-specific and is not documented for an
 * arbitrary scraper, so the page bytes are looked for under the keys a scraper
 * can plausibly emit them as. Nothing is guessed beyond this list: a delivery
 * carrying none of them is refused with the list in the message, rather than
 * quietly ingesting an empty page.
 */
export const HTML_KEYS = ['html', 'page_html', 'body_html', 'raw_html', 'content'] as const;

// TODO(types): a Bright Data record is whatever the collector was written to
// emit. An interface here would be a fabrication -- the only key this code
// requires is found by name at runtime, and the search is the contract.
const Row = z.looseObject({});
const Delivery = z.array(Row).min(1, 'a delivery with no rows has nothing to evaluate');

export class DeliveryError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
  }
}

/**
 * Constant-time bearer check.
 *
 * Both sides are hashed first so the comparison is over fixed-length buffers --
 * `timingSafeEqual` throws on a length mismatch, and catching that throw would
 * leak the secret's length through the error path.
 */
export function verifyBearer(header: string | null | undefined, secret: string): boolean {
  const m = /^Bearer\s+(\S+)$/i.exec(header || '');
  if (!m) return false;
  const a = createHash('sha256').update(m[1]!).digest();
  const b = createHash('sha256').update(secret).digest();
  return timingSafeEqual(a, b);
}

/**
 * The most a delivery may inflate to.
 *
 * A gzip stream a few kilobytes long can inflate to gigabytes -- the ratio is
 * roughly a thousand to one on repetitive input, and a delivery body is
 * attacker-shaped as soon as the bearer token leaks or the vendor is having a
 * bad day. Without a bound, `gunzipSync` allocates whatever the stream asks for
 * on the request thread and the process dies. 64 MiB is far above any real batch
 * of page HTML and far below what it takes to hurt.
 */
const MAX_INFLATED = 64 * 1024 * 1024;

/**
 * Bytes on the wire to rows.
 *
 * Gzip is detected by magic number rather than by `content-encoding`: no
 * content type or encoding header is documented on the delivery at all, so
 * reading one would be trusting a field the vendor never promised to send.
 */
export function decodeDelivery(raw: Buffer): unknown[] {
  let bytes: Buffer;
  try {
    // `maxOutputLength` is zlib's own bound -- it stops at the limit rather than
    // inflating first and measuring after, which is the only version of this
    // check that helps.
    bytes = raw[0] === 0x1f && raw[1] === 0x8b
      ? gunzipSync(raw, { maxOutputLength: MAX_INFLATED })
      : raw;
  } catch (e) {
    // Told apart from a corrupt stream, because they are different facts about
    // the sender and only one of them is worth waking up for.
    if ((e as NodeJS.ErrnoException).code === 'ERR_BUFFER_TOO_LARGE') {
      throw new DeliveryError(
        413, 'too_large',
        `the delivery inflates to more than ${MAX_INFLATED} bytes; Assay stopped decompressing it`,
      );
    }
    // A truncated or corrupt gzip is a bad request, not a server fault. It has
    // to be a 4xx: Bright Data retries anything that is not a 200, so a 500
    // here would make one broken delivery retry for ever.
    throw new DeliveryError(400, 'bad_gzip', `body claims gzip but will not inflate: ${(e as Error).message}`);
  }
  const text = bytes.toString('utf8').trim();
  if (!text) throw new DeliveryError(400, 'empty', 'the delivery body was empty');

  // `format: json` gives an array; `ndjson`/`jsonl` give one object per line.
  // Both are documented options on the same endpoint, so both are accepted --
  // this is a declared format, not a fallback.
  let parsed: unknown;
  if (text.startsWith('[')) {
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      throw new DeliveryError(400, 'unparseable', `body is not valid JSON: ${(e as Error).message}`);
    }
  } else {
    try {
      parsed = text.split('\n').filter(Boolean).map((l) => JSON.parse(l));
    } catch (e) {
      throw new DeliveryError(400, 'unparseable', `body is not valid NDJSON: ${(e as Error).message}`);
    }
  }

  const r = Delivery.safeParse(parsed);
  if (!r.success) throw new DeliveryError(400, 'malformed', issueDetail(r.error.issues[0]!));
  return r.data;
}

/**
 * The page bytes out of the first row that carries them, or the first row
 * rendered as one.
 *
 * HTML FIRST AND UNCHANGED. A Scraper Studio collector that emits page bytes
 * under one of `HTML_KEYS` takes exactly the path it took before this second
 * branch existed, byte for byte -- the precedence is not a preference, it is
 * the guarantee that adding a source did not move an existing one.
 *
 * THE SECOND BRANCH CLOSES A REAL HOLE. Bright Data's 1000+ PREBUILT scrapers
 * return structured JSON records, never page HTML
 * (https://docs.brightdata.com/datasets/scrapers/overview, fetched 2026-08-23).
 * Pointed at this endpoint they carried no `HTML_KEYS` key and were refused
 * 422 -- so the vendor's own headline product could not reach the receiver
 * built for that vendor. A record is now rendered through `recordToHtml` and
 * ingested like any other document; `./record.ts` argues why that is a real
 * document and not a wrapper, and the engine is never told which branch ran.
 *
 * A row that is neither is still refused, and the message now names both ways
 * in rather than only the one.
 */
export function pageFrom(rows: unknown[]): string {
  for (const row of rows) {
    for (const k of HTML_KEYS) {
      const v = (row as Record<string, unknown>)[k];
      if (typeof v === 'string' && v.length > 0) return v;
    }
  }
  for (const row of rows) {
    if (isRecord(row)) return recordToHtml(row);
  }
  throw new DeliveryError(
    422,
    'no_page',
    `no row carried page bytes under any of: ${HTML_KEYS.join(', ')}, ` +
      'and no row was a structured record. Configure the collector to emit the page HTML ' +
      'under one of those keys, or deliver a prebuilt scraper’s records unchanged.',
  );
}

/** Whether this exact page was already accepted for this target, recently. */
async function isReplay(targetId: string, sha: string): Promise<boolean> {
  const { rows } = await getDb().execute(sql`
    SELECT 1 FROM runs
    WHERE target_id = ${targetId} AND page_sha = ${sha}
      AND started_at > now() - ${`${REPLAY_WINDOW_SEC} seconds`}::interval
    LIMIT 1`);
  return (rows as unknown[]).length > 0;
}

export interface ReceiveResult {
  target: string;
  run: number;
  proof: string | null;
  event: string;
  status: string;
  skipped: boolean;
  episode: number | null;
  /**
   * Set only when this run OPENED an episode -- so a field that is already
   * broken and still broken announces nothing. That dedupe lives in
   * `openEpisode`, and this field is how it reaches the chat connectors.
   */
  announcement: Announcement | null;
}

/**
 * Authenticate a delivery, then run it down the same pipeline a local fetch
 * takes. The engine is never told where the bytes came from.
 *
 * Throws DeliveryError with the status to return. Everything else is a bug and
 * should surface as a 500 rather than be flattened into a 400.
 */
export async function authorise(authorization: string | null): Promise<void> {
  const cfg = await secretFor('brightdata');
  // Fail closed. An unconfigured receiver that accepts anything is the hole
  // this whole module exists to avoid.
  if (!cfg) {
    throw new DeliveryError(503, 'not_configured', 'no Bright Data connector is configured');
  }
  if (!verifyBearer(authorization, cfg.secret)) {
    throw new DeliveryError(401, 'unauthorized', 'the delivery did not carry the configured bearer');
  }
}

export async function receive({
  targetId,
  body,
}: {
  targetId: string;
  /** Already authorised: `authorise` runs before the caller buffers this. */
  body: Buffer;
}): Promise<ReceiveResult> {
  const [target] = await getDb().select().from(targets).where(eq(targets.targetId, targetId)).limit(1);
  if (!target) throw new DeliveryError(404, 'unknown_target', `no target "${targetId}"`);

  const html = pageFrom(decodeDelivery(body));
  // Digested the way `runs.page_sha` is, not over the raw bytes -- identical
  // raw bytes normalise identically, so this still catches a replay, and it is
  // the only digest that can be compared against what was actually stored.
  if (await isReplay(targetId, pageDigest(html))) {
    throw new DeliveryError(
      409,
      'replay',
      `this page was already delivered for "${targetId}" within ${REPLAY_WINDOW_SEC}s`,
    );
  }

  const r = await ingestPage({
    target: target as unknown as TargetRow,
    html,
    via: 'brightdata',
  });

  return {
    target: targetId,
    run: r.runId,
    proof: r.proofId,
    event: r.skipped ? 'skipped' : String(r.result!.event.event),
    status: r.skipped ? 'skipped' : r.result!.status.status,
    skipped: r.skipped,
    episode: r.episodeId,
    announcement: r.episodeId === null ? null : {
      target: targetId,
      field: String(r.result!.event.field),
      diagnosis: String(r.result!.event.diagnosis),
      run: r.runId,
    },
  };
}
