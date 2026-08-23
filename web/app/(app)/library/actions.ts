'use server';

import { revalidatePath } from 'next/cache';
import { scraperTracker, urlComplaint, type Tracker } from 'assay/engine/library/index';
import {
  DatasetId, fieldNameFor, fieldsFromRecord, libraryTrackerById, scrape, scraperById,
} from 'assay/engine/connectors/scrapers';
import { recordToHtml } from 'assay/engine/connectors/record';
import { analyse } from 'assay/engine/library/analyse';
import { contractFor } from 'assay/engine/library/contract';
import { saveContract } from 'assay/engine/contracts/store';
import { fetchHtml } from 'assay/engine/skills/page';
import { build, type BuildResult } from '../watch-actions';
import { assertOperator } from '@/lib/auth';

/**
 * Read the operator's page through a tracker, then watch it.
 *
 * TWO STEPS AND THE FIRST WRITES NOTHING. `inspect` fetches the URL the
 * operator pasted and runs the tracker's priors over it, so what comes back is
 * a proposal made of values that are really on their page. `approve` is the
 * second click. That is the same ordering `/skills` uses -- say what confirming
 * does, then confirm -- and it is the whole reason this is not a feature that
 * creates scrapers on a menu selection.
 *
 * `approve` IS NOT A SECOND WRITE PATH. It calls `build`, the same server
 * action Home's proposal calls when the operator presses "Start watching these
 * fields", which parses `CreateInput` and calls `createTarget`. A tracker
 * changes what Assay guesses first; it changes nothing about who says yes.
 *
 * THE PROPOSAL IS NOT TRUSTED BACK FROM THE BROWSER. `approve` re-fetches and
 * re-analyses rather than taking the `FieldInput`s `inspect` returned. Two
 * reasons, and the second is the real one: a resolver arriving from a client is
 * a selector arriving from a client, which is exactly what FEATURES.md F7
 * refuses; and a proposal is a reading of a page at a moment, so a baseline
 * built from a reading made ten minutes ago is a baseline built from a page
 * that may no longer exist. The browser sends the tracker id, the URL and which
 * field names to keep -- three pieces of data, none of them a selector.
 *
 * A PREBUILT-SCRAPER TRACKER CHANGES ONE LINE OF THAT, AND ONLY ONE. `read`
 * asks Bright Data for a JSON record instead of fetching a page, and renders it
 * through `recordToHtml`. Everything downstream is the same object graph:
 * `analyse` gets HTML and cannot tell which produced it, `approve` calls the
 * same `build`, and `createTarget` writes the same rows. The browser sends one
 * more piece of data for the operator-supplied-dataset card -- a `dataset_id`,
 * which is an ADDRESS and not a selector: it says which of Bright Data's
 * thousand scrapers to ask, the way the URL says which page. It is validated
 * against `DatasetId` before it is ever put in a URL Assay then calls.
 *
 * THE FIELD NAMES FOR THAT CARD ARE DERIVED SERVER-SIDE, on both calls, from
 * the record that call actually returned -- never carried across from
 * `inspect`. That is the same rule as the resolvers and it is there for the
 * same reason.
 */

export interface InspectedField {
  name: string;
  /**
   * What the operator reads in the table. Carried back rather than looked up
   * from the tracker, because the operator-supplied-dataset card has no fields
   * until a record has been read and there is nothing on the client to look up.
   */
  label: string;
  /** What the prior found, as the page reads. Null when nothing matched. */
  value: string | null;
  /** How many distinct candidates matched. More than one is worth saying. */
  matches: number;
}

export type InspectResult =
  | { ok: true; url: string; fields: InspectedField[] }
  | { ok: false; detail: string };

/** What this tracker's priors find on the operator's page. Read-only. */
export async function inspect(
  trackerId: string,
  url: string,
  datasetId?: string,
): Promise<InspectResult> {
  // Before the fetch, not after. This action takes a url from the caller and
  // opens it from the server, so without this an anonymous POST would have the
  // instance fetching arbitrary pages on its behalf -- the address guard in
  // `fetchHtml` decides WHERE it may go, and this decides WHO may ask. It is
  // the same reasoning for a scraper tracker, and one degree sharper: that path
  // spends the operator's Bright Data credit per call.
  await assertOperator();
  const t = libraryTrackerById(trackerId);
  if (!t) return { ok: false, detail: 'No such tracker.' };

  const target = url.trim();
  if (!/^https?:\/\//i.test(target)) return { ok: false, detail: 'That is not an http or https URL.' };

  const r = await read(t, target, datasetId);
  if (!r.ok) return r;

  return {
    ok: true,
    url: target,
    fields: r.analysis.found.map((f) => ({
      name: f.name,
      label: r.tracker.fields.find((x) => x.name === f.name)?.label ?? f.name,
      value: f.value,
      matches: f.matches,
    })),
  };
}

export interface ApproveResult {
  build: BuildResult;
  /**
   * The field contract written for each created target, and whether it landed.
   * Empty when the build failed, because there was nothing to write against.
   */
  contracts: { field: string; targetId: string; ok: boolean; detail: string | null }[];
}

/**
 * Create the watch.
 *
 * A field the operator kept that this second read cannot find is dropped rather
 * than sent on to be refused: `createTarget` rejects the WHOLE watch when any
 * field's resolver matches nothing, so passing an unfindable field through
 * would lose the operator the fields that did work. If nothing at all survives,
 * that is said plainly.
 *
 * THE CONTRACT IS WRITTEN AFTER THE TARGETS EXIST, never before, for the reason
 * `saveContract` enforces: it looks the target up and refuses an id it does not
 * find. A contract that fails to save is reported rather than swallowed -- a
 * tracker that quietly left the engine defaults in force while the screen said
 * "strict" would be a lie about the setting the tracker was chosen for.
 */
export async function approve(input: {
  trackerId: string;
  url: string;
  keep: string[];
  cadence: string;
  /** Only read for the card whose `datasetId` is null. Validated, never trusted. */
  datasetId?: string;
}): Promise<ApproveResult> {
  await assertOperator();
  const t = libraryTrackerById(input.trackerId);
  if (!t) return { build: { ok: false, detail: 'No such tracker.' }, contracts: [] };

  const url = input.url.trim();
  const r = await read(t, url, input.datasetId);
  if (!r.ok) return { build: { ok: false, detail: r.detail }, contracts: [] };

  const keep = new Set(input.keep);
  const fields = r.analysis.create.filter((f) => keep.has(f.name));
  if (!fields.length) {
    return {
      build: {
        ok: false,
        detail: 'Nothing on that page matches the fields you kept. The page may have changed '
          + 'since it was read a moment ago.',
      },
      contracts: [],
    };
  }

  const built = await build({ url, cadence: input.cadence, fields }, fields.map((f) => f.name));
  if (!built.ok) return { build: built, contracts: [] };

  // `r.tracker`, not `t`: for the operator-supplied-dataset card those are
  // different objects, and the contract has to be written against the tier of
  // the field that was actually proposed on THIS read.
  const contracts = await writeContracts(r.tracker, built.fields);

  revalidatePath('/library');
  revalidatePath('/', 'layout');
  return { build: built, contracts };
}

type Read =
  | { ok: true; tracker: Tracker; analysis: ReturnType<typeof analyse> }
  | { ok: false; detail: string };

/**
 * Get a document and analyse it, in the one place both entry points reach it.
 *
 * `fetchHtml` rather than a bare `fetch` because that is the seam every other
 * read in this product goes through -- a page only an enabled connector can
 * reach is inspectable here for the same reason it is watchable later.
 *
 * THE ONLY BRANCH IN THIS FEATURE IS THE ONE THAT GETS THE BYTES. Below this
 * line there is a string of HTML and `analyse`, and neither knows nor can find
 * out whether a page was fetched or a record was rendered. Any second branch
 * further down would be a second extraction path, which is the thing
 * `src/skills/page.ts` exists to have exactly one of.
 *
 * It returns the tracker it used because a scraper tracker with no documented
 * record shape acquires its fields HERE, from the record this call returned.
 */
async function read(t: Tracker, url: string, datasetId?: string): Promise<Read> {
  // Before the fetch, and in `read` rather than in `inspect`, so `approve` --
  // which re-fetches and re-analyses rather than trusting the browser -- is
  // covered by the same line. A tracker whose priors only parse one page shape
  // refuses the others instead of reading them and proposing whatever matched.
  const complaint = urlComplaint(t, url);
  if (complaint) return { ok: false, detail: complaint };

  if (t.kind === 'page') {
    try {
      const { html } = await fetchHtml(url);
      return { ok: true, tracker: t, analysis: analyse(t, html) };
    } catch (e) {
      // The URL is the operator's own input, so the failure is theirs to see.
      // It names no internal detail.
      return { ok: false, detail: `Could not read ${url}: ${(e as Error).message}` };
    }
  }

  // A card with a null `datasetId` is the one that covers Bright Data's other
  // thousand scrapers, and the id is the operator's to supply. A card with one
  // ignores whatever arrived from the browser rather than letting it override --
  // the shipped id is a verified fact and the request is not.
  const supplied = t.datasetId ?? (datasetId ?? '').trim();
  if (!supplied) {
    return { ok: false, detail: 'Paste the Bright Data dataset ID for the scraper you want.' };
  }
  const id = DatasetId.safeParse(supplied);
  if (!id.success) return { ok: false, detail: id.error.issues[0]!.message };

  let record: Record<string, unknown>;
  try {
    record = await scrape(id.data, url);
  } catch (e) {
    // `ScrapeError`'s message already names the endpoint and what it said, and
    // deliberately never carries the token. Anything else is a bug and reads as
    // one rather than being dressed up as a bad URL.
    return { ok: false, detail: `Could not read ${url}: ${(e as Error).message}` };
  }

  const entry = scraperById(t.id);
  if (!entry) return { ok: false, detail: 'No such tracker.' };

  // Named scrapers keep the fields taken from their documented example record,
  // so what the operator saw before pressing Run is what gets proposed. The
  // undocumented card has nothing to keep and takes them from the record.
  const tracker = t.datasetId
    ? t
    : scraperTracker(
      entry,
      fieldsFromRecord(record)
        .map((path) => ({ path, name: fieldNameFor(path) }))
        .filter((f): f is { path: string; name: string } => f.name !== null),
    );

  return { ok: true, tracker, analysis: analyse(tracker, recordToHtml(record)) };
}

/**
 * One contract document per created target, because that is the granularity the
 * store reads at: `latestContract(target.targetId)` in `src/connectors/ingest.ts`.
 *
 * The id is the one `createTarget` returned, not one recomputed from the URL.
 * Recomputing would mean agreeing with the store by repeating its slug rules
 * here, and the two would drift the first time a rule changed.
 */
async function writeContracts(
  t: Tracker,
  created: readonly { id: string; field: string }[],
): Promise<ApproveResult['contracts']> {
  const out: ApproveResult['contracts'] = [];

  for (const row of created) {
    const field = t.fields.find((f) => f.name === row.field);
    if (!field) continue;
    const r = await saveContract(contractFor(field, row.id));
    out.push({
      field: row.field,
      targetId: row.id,
      ok: r.ok,
      // The issues carry lines into a document the operator never wrote, so the
      // messages are joined rather than rendered as a source location.
      detail: r.ok ? null : r.issues.map((i) => i.message).join(' '),
    });
  }

  return out;
}
