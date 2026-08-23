// Bright Data's prebuilt scrapers, as a source of records for the same gate.
//
// Verified against docs fetched 2026-08-23:
//   https://docs.brightdata.com/datasets/scrapers/overview
//   https://docs.brightdata.com/datasets/scrapers/instagram/quickstart
//   https://docs.brightdata.com/datasets/scrapers/linkedin/quickstart
//   https://docs.brightdata.com/api-reference/web-scraper-api/synchronous-requests
//   https://docs.brightdata.com/api-reference/scrapers/management-apis/monitor-progress
//   https://docs.brightdata.com/api-reference/scrapers/delivery-apis/download-snapshot
//
// What those pages establish, and what each one forces here:
//
//   * A prebuilt scraper is named by a `dataset_id`. There are over a thousand
//     of them and the pages above confirm exactly TWO by sight. See the note on
//     `SCRAPERS` for why that number, and not a rounder one, decides the shape
//     of this catalogue.
//   * Sync: `POST /datasets/v3/scrape?dataset_id=<id>&format=json`, bearer auth,
//     and the body is a BARE JSON ARRAY -- `[{"url": "..."}]` -- not an object
//     with an `input` key. The api-reference page for synchronous requests
//     describes an `{"input": [...]}` wrapper; every quickstart, including the
//     two cited above, shows the bare array. The quickstarts are the pages a
//     working integration is copied from, so the bare array is what this sends.
//   * Up to 20 URLs per sync request. This asks for one, so that ceiling is
//     documented rather than enforced -- there is no batch here to bound.
//   * "This synchronous request is subject to a 1 minute timeout limit", after
//     which "the API will return an HTTP 202 response ... you will receive a
//     snapshot ID". A 202 IS NOT A RECORD. Treating that body as one is how a
//     scraper starts publishing `{"snapshot_id": "s_..."}` as though it were a
//     profile, so it is the one response shape this module handles by name.
//   * Async retrieval is two endpoints, both GET with the same bearer:
//     `/datasets/v3/progress/{snapshot_id}` -> `{"status": "..."}` where status
//     is one of starting, running, ready, failed, canceled; and then
//     `/datasets/v3/snapshot/{snapshot_id}?format=json` -> an array of records.
//
// A record from here goes through `./record.ts` and into the same `ingestPage`
// a fetched page does. There is no second extraction path and no weaker check:
// the tau/delta gate, the brake, the contract and the measured wrong-value rate
// all apply because the engine cannot tell where the bytes came from.

import { z } from 'zod';
// Re-exported so the screens have one import for the whole feature, and because
// the two are used together everywhere: a path is offered only if it can be a
// field name, and watched only through the class the renderer gave it.
import { fieldNameFor } from './record.js';
import { TRACKERS, scraperTracker, type Tracker } from '../library/index.js';

export { fieldNameFor };

/** Assay's own name for one prebuilt scraper. */
export interface PrebuiltScraper {
  id: string;
  /**
   * Bright Data's dataset_id, or null for the card that takes one from the
   * operator. Every non-null value here was READ OFF the page named in
   * `docUrl`; none was inferred from another, and none is a guess.
   */
  datasetId: string | null;
  name: string;
  site: string;
  placeholder: string;
  /**
   * The JSON keys worth watching, as PATHS into the documented example record
   * (`current_company.name`, not `current_company`). Every one of these appears
   * in the example on `docUrl`.
   *
   * Long prose keys are left out on purpose rather than listed and left to
   * fail: `candidatesOn` ignores text longer than 200 characters, so a
   * biography would be reported as "not on this page" every time, which reads
   * as a bug in Assay rather than as the limit it is.
   */
  fields: readonly string[];
  docUrl: string;
}

/**
 * The catalogue, and why it is three cards rather than a thousand.
 *
 * Bright Data advertises 1000+ prebuilt scrapers. Two dataset_ids are visible
 * on doc pages that were actually fetched, and a dataset_id cannot be derived,
 * guessed or pattern-matched -- `gd_l1vikfch901nx3by4` and
 * `gd_l1viktl72bvl7bjuj0` share a prefix and nothing else. Shipping a card for
 * "TikTok" with an id nobody read off a page would be a confident wrong answer
 * about a third party's API, which is precisely the class of failure this
 * product exists to refuse, and it would fail as a 404 the operator would
 * reasonably read as Assay being broken.
 *
 * So: the two that are confirmed, by name, with their fields taken from the
 * documented example record -- plus one card that takes a dataset_id from the
 * operator. That third card covers all thousand and fabricates nothing, and it
 * is the honest shape of "we support the ones we have verified".
 */
export const SCRAPERS: readonly PrebuiltScraper[] = [
  {
    id: 'instagram-profile',
    // Read off the curl example and the endpoint URL on the page below.
    datasetId: 'gd_l1vikfch901nx3by4',
    name: 'Instagram profile',
    site: 'instagram.com',
    placeholder: 'https://www.instagram.com/instagram',
    // From the example record on that page: user_name, full_name, biography,
    // followers, following, posts_count, is_verified, url. `biography` is
    // omitted for the length reason above; `url` is the input echoed back and
    // watching it would be watching what you typed.
    fields: ['followers', 'following', 'full_name', 'is_verified', 'posts_count', 'user_name'],
    docUrl: 'https://docs.brightdata.com/datasets/scrapers/instagram/quickstart',
  },
  {
    id: 'linkedin-profile',
    // Read off the "Your first request" example on the scrapers overview page
    // and confirmed as LinkedIn People Profiles on the LinkedIn quickstart.
    datasetId: 'gd_l1viktl72bvl7bjuj0',
    name: 'LinkedIn profile',
    site: 'linkedin.com',
    placeholder: 'https://www.linkedin.com/in/satyanadella',
    // From the example record: name, city, country_code, position,
    // current_company (nested: name, link), followers, connections, url.
    // `current_company.name` is a nested key and is watched as one -- it is a
    // leaf in the rendered document like any other.
    fields: ['city', 'connections', 'country_code', 'current_company.name', 'followers', 'name'],
    docUrl: 'https://docs.brightdata.com/datasets/scrapers/linkedin/quickstart',
  },
  {
    id: 'dataset',
    // The point of this card. There is no id to cite because the operator
    // supplies it, and a null here is what the screens branch on to ask for one.
    datasetId: null,
    name: 'Any Bright Data scraper',
    site: 'brightdata.com',
    placeholder: 'https://example.com/the-page',
    // Nothing is known about an arbitrary dataset's record shape, so nothing is
    // claimed. The fields come from the record the operator's first Run
    // actually returns -- see `fieldsFromRecord`.
    fields: [],
    docUrl: 'https://docs.brightdata.com/datasets/scrapers/overview',
  },
];

export const scraperById = (id: string): PrebuiltScraper | undefined =>
  SCRAPERS.find((s) => s.id === id);

/**
 * The whole catalogue, both kinds, in one list.
 *
 * IT IS ASSEMBLED HERE RATHER THAN IN `../library/index.ts` because that module
 * must import nothing heavier than a module which itself imports nothing -- it
 * is reached from client components, and this file carries zod and `fetch`. So
 * the tracker VOCABULARY lives there and the JOIN lives here, and the screens
 * that need both are server components, which is every screen in
 * `web/app/(app)/library/` except the one that takes a tracker as a prop.
 */
export const ALL_TRACKERS: readonly Tracker[] = [
  ...TRACKERS,
  ...SCRAPERS.map((s) => scraperTracker(s)),
];

/** One tracker of either kind, by id. What the library screens look up. */
export const libraryTrackerById = (id: string): Tracker | undefined =>
  ALL_TRACKERS.find((t) => t.id === id);

/**
 * A dataset_id, validated because it goes into a URL Assay then calls.
 *
 * Bright Data has never documented the grammar, so this is the loosest rule
 * that is still a rule: the `gd_` prefix every confirmed id carries, then
 * lowercase alphanumerics. It exists to stop a query string or a path traversal
 * arriving from a browser and being appended to an api.brightdata.com URL, not
 * to predict what Bright Data will mint next. An id this refuses that is
 * genuinely valid is a bug worth a one-line fix; an id this accepts that is
 * hostile is a hole.
 */
export const DatasetId = z.string().regex(/^gd_[a-z0-9]+$/, 'a dataset_id looks like gd_l1vikfch901nx3by4');

/** A failure with the HTTP status to report, shaped like `DeliveryError`. */
export class ScrapeError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
  }
}

/**
 * The most a scrape response may be.
 *
 * `brightdata.ts` bounds an inbound delivery at 64 MiB because a gzip bomb is
 * cheap to send. This is the same reasoning pointed outwards: the response to
 * this request is bytes from a third party arriving on a worker thread, and one
 * profile record is kilobytes. 8 MiB is the same ceiling `src/skills/page.ts`
 * puts on a fetched page, which keeps the two sources of a document bounded the
 * same way, and it is three orders of magnitude above any real record.
 */
const MAX_BYTES = 8 * 1024 * 1024;

/** A slow endpoint must not pin a worker. Per request, not per `scrape` call. */
const TIMEOUT_MS = 90_000;

/**
 * How many times the snapshot's progress is polled before giving up, and how
 * long between polls.
 *
 * The sync endpoint already spent a minute on this job before handing back a
 * snapshot id, so the work is genuinely slow and a tight loop would only add
 * requests. Twenty polls five seconds apart is a hundred seconds -- enough for
 * the common case of a job that just overran the sync window, and bounded so a
 * job that is never going to finish fails with a sentence rather than holding a
 * worker until something else times out.
 */
const POLL_ATTEMPTS = 20;
const POLL_MS = 5_000;

const API = 'https://api.brightdata.com/datasets/v3';

/**
 * The token, by the name this repo already uses.
 *
 * `./config.ts` documents `BRIGHTDATA_API_TOKEN` as the variable that lets
 * ASSAY CALL BRIGHT DATA, as opposed to the delivery secret in the config file
 * that lets Bright Data call Assay. This is the calling half, so it is the same
 * variable, and introducing a second name would recreate the exact bug that
 * comment was written about -- two surfaces disagreeing about one credential.
 */
function token(): string {
  const t = process.env.BRIGHTDATA_API_TOKEN;
  if (!t) {
    throw new ScrapeError(
      503, 'no_token',
      'BRIGHTDATA_API_TOKEN is not set, so Assay cannot ask Bright Data for a record. '
      + 'Set it in the environment this process reads.',
    );
  }
  return t;
}

/**
 * The body, or a refusal -- never a truncated one.
 *
 * The same shape as `readCapped` in `src/skills/page.ts` and for the same
 * reason: `content-length` is the cheap check and also the obvious lie, so the
 * bytes actually read are counted too and the stream is cancelled the moment it
 * goes over. Returning what was read so far would hand a half-parsed record to
 * the engine, and a record missing half its keys reads downstream as a page
 * where half the fields disappeared.
 */
async function readCapped(res: Response, what: string): Promise<string> {
  const declared = Number(res.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_BYTES) {
    throw new ScrapeError(
      413, 'too_large',
      `${what} declares ${declared} bytes; Assay reads at most ${MAX_BYTES}.`,
    );
  }
  if (!res.body) return '';

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let out = '';
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BYTES) {
      await reader.cancel();
      throw new ScrapeError(
        413, 'too_large',
        `${what} sent more than ${MAX_BYTES} bytes; Assay stopped reading.`,
      );
    }
    out += decoder.decode(value, { stream: true });
  }
  return out + decoder.decode();
}

async function call(url: string, init: RequestInit, what: string): Promise<unknown> {
  // Read OUTSIDE the try. Inside, a missing token would be caught by the catch
  // below and reported as "the endpoint did not answer" -- an unset variable
  // dressed up as an outage, which is the same shape of misleading-but-true
  // report `./config.ts` was fixed for.
  const auth = `Bearer ${token()}`;

  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: { ...init.headers, authorization: auth },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    // A 502 rather than a 500: the request Assay made did not come back, which
    // is a statement about the upstream and not about this process. The token
    // is never in the message -- only the endpoint and what went wrong.
    throw new ScrapeError(502, 'unreachable', `${what} did not answer: ${(e as Error).message}`);
  }

  const text = await readCapped(res, what);

  if (!res.ok && res.status !== 202) {
    // Bright Data's own error string when there is one, truncated, because it
    // is the only thing that says WHICH of the many reasons a dataset call
    // fails this was -- a bad dataset_id and an exhausted quota are both 400s.
    throw new ScrapeError(
      res.status, 'upstream',
      `${what} answered ${res.status}${text ? `: ${text.slice(0, 400)}` : ''}`,
    );
  }

  if (!text.trim()) {
    // A 200 with no bytes is a failure and saying so is the point. It must not
    // become an empty record that then reads as "every field disappeared" --
    // the same failure `viaFirecrawl` refuses in `src/skills/page.ts`.
    throw new ScrapeError(502, 'empty', `${what} answered ${res.status} with an empty body`);
  }

  try {
    return JSON.parse(text);
  } catch (e) {
    throw new ScrapeError(502, 'unparseable', `${what} did not answer JSON: ${(e as Error).message}`);
  }
}

/**
 * The first record out of a scrape or snapshot body.
 *
 * Both endpoints answer with an array of records when they answer with records
 * at all, and this asks for one URL, so the first element is the record for
 * that URL. An array that is empty means the scraper ran and found nothing,
 * which is a real answer about the operator's URL and not something to paper
 * over with an empty object.
 */
function recordFrom(parsed: unknown, what: string): Record<string, unknown> {
  const rows = Array.isArray(parsed) ? parsed : [parsed];
  const first = rows[0];
  if (typeof first !== 'object' || first === null || Array.isArray(first)) {
    throw new ScrapeError(502, 'not_a_record', `${what} answered ${JSON.stringify(parsed).slice(0, 200)}`);
  }
  const row = first as Record<string, unknown>;
  if (!Object.keys(row).length) {
    throw new ScrapeError(422, 'empty_record', `${what} answered a record with no fields`);
  }
  // Bright Data reports a per-row failure as a row, not as a status -- a URL it
  // could not collect comes back as `{"warning": ..., "error": ...}`. Ingesting
  // that would publish an error message as though it were a profile.
  if (typeof row.error === 'string' && row.error) {
    throw new ScrapeError(422, 'row_error', `Bright Data could not collect that URL: ${row.error}`);
  }
  return row;
}

/** Bounded sleep, so the poll loop is readable as a loop. */
const wait = (ms: number): Promise<void> => new Promise((r) => { setTimeout(r, ms); });

/**
 * Wait out a job that overran the sync window, then download it.
 *
 * POLLING RATHER THAN FAILING because both endpoints are documented and were
 * read (`monitor-progress` and `download-snapshot`, cited at the top). A
 * `failed` or `canceled` status is reported as itself rather than retried: they
 * are terminal, and looping on one would turn a job Bright Data has given up on
 * into a hundred seconds of waiting for the operator.
 */
async function awaitSnapshot(snapshotId: string): Promise<Record<string, unknown>> {
  for (let i = 0; i < POLL_ATTEMPTS; i++) {
    await wait(POLL_MS);
    const p = await call(`${API}/progress/${encodeURIComponent(snapshotId)}`, { method: 'GET' }, 'the snapshot progress endpoint') as { status?: unknown };
    const status = typeof p.status === 'string' ? p.status : '';

    if (status === 'ready') {
      const body = await call(
        `${API}/snapshot/${encodeURIComponent(snapshotId)}?format=json`,
        { method: 'GET' },
        'the snapshot download endpoint',
      );
      return recordFrom(body, 'the snapshot download endpoint');
    }
    if (status === 'failed' || status === 'canceled') {
      throw new ScrapeError(
        502, `snapshot_${status}`,
        `Bright Data reports snapshot ${snapshotId} as ${status}. Nothing was collected.`,
      );
    }
    // starting / running: keep waiting. Anything else is undocumented, and
    // waiting on it is the same as waiting on `running` -- the attempt cap ends
    // it either way, with a message naming what was last seen.
  }

  throw new ScrapeError(
    504, 'snapshot_timeout',
    `Bright Data moved this request to a snapshot (${snapshotId}) and it was still not ready after `
    + `${(POLL_ATTEMPTS * POLL_MS) / 1000}s. The job is still running on their side: the results stay `
    + 'available for 16 days, so run this again in a few minutes, or trigger the scraper with a webhook '
    + 'pointed at this instance and let Bright Data deliver it.',
  );
}

/**
 * One URL through one prebuilt scraper, as a structured record.
 *
 * Sync first, because it is one request and usually answers. The 202 branch is
 * not an error path -- it is the documented behaviour of the endpoint after a
 * minute -- so it is handled rather than reported.
 */
export async function scrape(datasetId: string, url: string): Promise<Record<string, unknown>> {
  const id = DatasetId.safeParse(datasetId);
  if (!id.success) throw new ScrapeError(400, 'bad_dataset', id.error.issues[0]!.message);

  const what = `Bright Data's scrape endpoint for ${id.data}`;
  const body = await call(
    `${API}/scrape?dataset_id=${encodeURIComponent(id.data)}&format=json`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify([{ url }]),
    },
    what,
  );

  // The fallback, detected by SHAPE rather than by status. A 202 is what the
  // docs describe, but the same body arriving with a 200 is the same fact, and
  // a `snapshot_id` where a record should be is unambiguous: no documented
  // scraper record carries that key.
  const snapshotId = !Array.isArray(body) && typeof body === 'object' && body !== null
    ? (body as { snapshot_id?: unknown }).snapshot_id
    : undefined;
  if (typeof snapshotId === 'string' && snapshotId) return awaitSnapshot(snapshotId);

  return recordFrom(body, what);
}

/**
 * The field names to offer for a record nobody has documented.
 *
 * Only for the operator-supplied-dataset card, and only over keys that are
 * actually watchable -- a path `fieldNameFor` refuses is not offered rather
 * than offered and then refused by `createTarget` at the last step, which would
 * cost the operator the fields that did work. Capped, because a record with two
 * hundred keys would otherwise render two hundred checkboxes.
 */
export function fieldsFromRecord(record: Record<string, unknown>, limit = 12): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const path of Object.keys(record).sort()) {
    const v = record[path];
    // Scalars only. A nested object's leaves are watchable through the named
    // cards, which cite a documented shape; guessing which leaf of an
    // undocumented object matters is not something to do on the operator's
    // behalf.
    if (v !== null && typeof v === 'object') continue;
    const name = fieldNameFor(path);
    if (!name || seen.has(name)) continue;
    seen.add(name);
    out.push(path);
    if (out.length >= limit) break;
  }
  return out;
}
