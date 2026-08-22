'use server';

import { revalidatePath } from 'next/cache';
import { trackerById, type Tracker } from 'assay/engine/library/index';
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
 */

export interface InspectedField {
  name: string;
  /** What the prior found, as the page reads. Null when nothing matched. */
  value: string | null;
  /** How many distinct candidates matched. More than one is worth saying. */
  matches: number;
}

export type InspectResult =
  | { ok: true; url: string; fields: InspectedField[] }
  | { ok: false; detail: string };

/** What this tracker's priors find on the operator's page. Read-only. */
export async function inspect(trackerId: string, url: string): Promise<InspectResult> {
  // Before the fetch, not after. This action takes a url from the caller and
  // opens it from the server, so without this an anonymous POST would have the
  // instance fetching arbitrary pages on its behalf -- the address guard in
  // `fetchHtml` decides WHERE it may go, and this decides WHO may ask.
  await assertOperator();
  const t = trackerById(trackerId);
  if (!t) return { ok: false, detail: 'No such tracker.' };

  const target = url.trim();
  if (!/^https?:\/\//i.test(target)) return { ok: false, detail: 'That is not an http or https URL.' };

  const r = await read(t, target);
  if (!r.ok) return r;

  return {
    ok: true,
    url: target,
    fields: r.analysis.found.map((f) => ({ name: f.name, value: f.value, matches: f.matches })),
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
}): Promise<ApproveResult> {
  await assertOperator();
  const t = trackerById(input.trackerId);
  if (!t) return { build: { ok: false, detail: 'No such tracker.' }, contracts: [] };

  const url = input.url.trim();
  const r = await read(t, url);
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

  const contracts = await writeContracts(t, built.fields);

  revalidatePath('/library');
  revalidatePath('/', 'layout');
  return { build: built, contracts };
}

/**
 * Fetch and analyse, in the one place both entry points reach it.
 *
 * `fetchHtml` rather than a bare `fetch` because that is the seam every other
 * read in this product goes through -- a page only an enabled connector can
 * reach is inspectable here for the same reason it is watchable later.
 */
async function read(
  t: Tracker,
  url: string,
): Promise<{ ok: true; analysis: ReturnType<typeof analyse> } | { ok: false; detail: string }> {
  try {
    const { html } = await fetchHtml(url);
    return { ok: true, analysis: analyse(t, html) };
  } catch (e) {
    // The URL is the operator's own input, so the failure is theirs to see. It
    // names no internal detail.
    return { ok: false, detail: `Could not read ${url}: ${(e as Error).message}` };
  }
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
