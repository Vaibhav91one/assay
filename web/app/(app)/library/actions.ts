'use server';

import { revalidatePath } from 'next/cache';
import { templateById, type Template } from 'assay/engine/library/index';
import { contractFor } from 'assay/engine/library/contract';
import { saveContract } from 'assay/engine/contracts/store';
import { describeFields, type BuildResult } from '../watch-actions';

/**
 * Applying a template.
 *
 * THIS IS NOT A SECOND WRITE PATH, and the whole design turns on that. The
 * create call below is `describeFields` -- the same server action Home's
 * "Describe the fields yourself" form calls, which itself ends in `build` ->
 * `createTarget`. A template supplies the field NAMES and the tiers; the
 * operator still pastes what each value reads as on their own page, still sees
 * the list, and still presses the one button. Nothing is created without that.
 *
 * WHAT A TEMPLATE CANNOT SUPPLY IS A SELECTOR, and that is not a gap. A shape
 * template describes "a page listing dated notices", which is true of markup
 * this repository has never seen -- so there is no selector to ship, and
 * FEATURES.md F7 would forbid shipping one anyway. `describeFields` derives the
 * resolver from where the operator's pasted text actually sits in the DOM. A
 * field whose example is not on the page comes back as a refusal naming it.
 *
 * THE CONTRACT IS WRITTEN AFTER THE TARGETS EXIST, never before, for the reason
 * `saveContract` itself enforces: it looks the target up and refuses an id it
 * does not find. Writing first would mean either a contract pointing at nothing
 * or a target created to satisfy a document. A contract that fails to save is
 * reported rather than swallowed -- a template that silently applied the default
 * tier while the screen said "strict" would be a lie about the one setting the
 * operator chose the template for.
 */

export interface ApplyResult {
  build: BuildResult;
  /**
   * The field contract written for each created target, and whether it landed.
   * Empty when the build failed, because there was nothing to write against.
   */
  contracts: { field: string; targetId: string; ok: boolean; detail: string | null }[];
}

export async function applyTemplate(input: {
  templateId: string;
  url: string;
  cadence: string;
  /** One example per field, in the operator's own words off their own page. */
  examples: { name: string; example: string }[];
}): Promise<ApplyResult> {
  const t = templateById(input.templateId);
  if (!t) return { build: { ok: false, detail: 'No such template.' }, contracts: [] };

  // Only fields the operator actually gave an example for. A blank row is them
  // declining that field, which is a supported choice -- a page of this shape
  // that happens not to carry a date is still a page of this shape.
  const named = new Set(t.fields.map((f) => f.name));
  const fields = input.examples
    .map((e) => ({ name: e.name.trim(), example: e.example.trim() }))
    .filter((e) => e.name && e.example && named.has(e.name));

  if (!fields.length) {
    return {
      build: { ok: false, detail: 'Paste an example of at least one value as it reads on your page.' },
      contracts: [],
    };
  }

  const build = await describeFields({ url: input.url, cadence: input.cadence, fields });
  if (!build.ok) return { build, contracts: [] };

  const contracts = await writeContracts(t, build.fields);

  revalidatePath('/library');
  revalidatePath('/', 'layout');
  return { build, contracts };
}

/**
 * One contract document per created target, because that is the granularity
 * the store reads at: `latestContract(target.targetId)` in
 * `src/connectors/ingest.ts`.
 *
 * The id is the one `createTarget` returned, not one recomputed from the URL.
 * Recomputing would mean agreeing with the store by repeating its slug rules
 * here, and the two would drift the first time a rule changed.
 */
async function writeContracts(
  t: Template,
  created: readonly { id: string; field: string }[],
): Promise<ApplyResult['contracts']> {
  const out: ApplyResult['contracts'] = [];

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
