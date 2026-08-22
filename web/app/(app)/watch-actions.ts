'use server';

import { revalidatePath } from 'next/cache';
import {
  converse, candidatesOn, resolverFor, CADENCES,
  type ChatResult, type Proposal,
} from 'assay/engine/agent/index';
import { createTarget, CreateInput, listTargets } from 'assay/engine/setup/index';
import {
  appendTurns, attachScraper, startConversation, type Turn,
} from 'assay/engine/store/conversations';

export type { ChatResult, Proposal };
export type { Turn };

/** One thing `@` can name: a field already under watch. */
export interface Source {
  /** The target row id, `slug__field`. What the operator inserts. */
  id: string;
  field: string;
  url: string;
  cadence: string;
  paused: boolean;
  /** Cells this field is currently holding. A real count, zero included. */
  held: number;
}

/**
 * What `@` offers: the fields this instance already watches, and nothing else.
 *
 * Read live rather than passed down from the page, because the menu opens long
 * after the page rendered and a stale list would offer a target that has since
 * been deleted. An empty array is the honest answer for a fresh instance and the
 * menu says so -- there is no sample row here, and inventing one would be the
 * "mock data that quietly contradicts the repo's own honesty claim" that
 * docs/APP-DESIGN.md 4.1 refuses.
 */
export async function sources(): Promise<Source[]> {
  const { targets } = await listTargets();
  return targets.map((t) => ({
    id: t.id, field: t.field, url: t.url,
    cadence: t.cadence, paused: t.paused, held: t.held,
  }));
}

/**
 * One turn of "What should Assay watch?".
 *
 * Stateless on the server: the caller holds the history and passes it back, so
 * there is no session store and a reload starts a new conversation rather than
 * resuming a half-remembered one.
 *
 * Never throws for an unconfigured model. `converse` answers `kind: 'manual'`
 * with a sentence saying so, because "Assay runs with no model configured" is
 * a promise the product makes, not an error state.
 */
export async function ask(
  message: string,
  history: { role: 'operator' | 'assay'; text: string }[],
): Promise<ChatResult> {
  return converse({ message, history });
}

// --- the conversation ---------------------------------------------------------

/**
 * Open a conversation on the operator's first message.
 *
 * Called BEFORE the turn is asked, so the transcript exists even if the agent
 * never answers -- a question that was asked and got nothing back is a fact
 * about this instance, and losing it because the model timed out would make the
 * rail's list quietly wrong.
 *
 * The name is `titleFor(message)`: the operator's own words, truncated. No model
 * call, and nothing invented.
 */
export async function openConversation(message: string): Promise<number> {
  const id = await startConversation(message);
  revalidatePath('/', 'layout');
  return id;
}

/**
 * Append to a transcript.
 *
 * Trusted with what the browser sends because everything in a turn CAME from the
 * browser or was rendered for it: the operator's own message, and the reply and
 * trace this instance streamed back a moment ago. There is nothing here a
 * hostile client could gain by lying about, and no path from this table into the
 * gate, the queue or a proof record -- `conversations` is read by the rail and
 * by the export, and by nothing that decides anything.
 */
export async function recordTurns(id: number, turns: Turn[]): Promise<void> {
  await appendTurns(id, turns);
  revalidatePath('/', 'layout');
}

/** One field after its baseline run. `status` and `reason` are the gate's own. */
export interface BuiltField {
  /** The target row id, `slug__field`. Links a held cell to its decision. */
  id: string;
  field: string;
  baseline: string | null;
  baseline_run: number;
  /** `live | healed | quarantined | stale | degraded`, from `src/envelope.ts`. */
  status: string;
  /** The engine code behind that status, or null. Never shown raw -- see `HeldCell`. */
  reason: string | null;
}

export type BuildResult =
  | { ok: true; id: string; fields: BuiltField[] }
  | { ok: false; detail: string };

/**
 * Confirm a proposal.
 *
 * The body is `proposal.create` unchanged apart from the fields the operator
 * unticked, so a model's proposal and a hand-typed form take the identical
 * write path -- there is no privileged "the agent said so" route into the
 * store.
 *
 * `conversationId` is the ownership edge and is written AFTER the scraper
 * exists, never before: a conversation that claimed a scraper `createTarget`
 * then refused to make would be a rail entry pointing at nothing. It is optional
 * because the manual path and the API reach here without a conversation, and a
 * scraper with no chat is a supported state -- every target that predates this
 * table is one.
 */
export async function build(
  create: unknown,
  keep: string[],
  conversationId?: number,
): Promise<BuildResult> {
  const parsed = CreateInput.safeParse(create);
  if (!parsed.success) return { ok: false, detail: 'That proposal is not a valid target.' };

  const fields = parsed.data.fields.filter((f) => keep.includes(f.name));
  if (fields.length === 0) return { ok: false, detail: 'Keep at least one field.' };

  const r = await createTarget({ ...parsed.data, fields });
  if (!r.ok) return { ok: false, detail: r.detail };

  if (conversationId != null) {
    await attachScraper(conversationId, r.id);
    await appendTurns(conversationId, [{
      role: 'event',
      kind: 'built',
      at: new Date().toISOString(),
      text: `Started watching ${r.id} — ${fields.length} field${fields.length === 1 ? '' : 's'}.`,
    }]);
  }

  revalidatePath('/', 'layout');
  revalidatePath('/decisions');
  return {
    ok: true,
    id: r.id,
    fields: r.targets.map((t) => ({
      id: t.id,
      field: t.field,
      baseline: t.baseline_value,
      baseline_run: t.baseline_run,
      status: t.status,
      reason: t.reason,
    })),
  };
}

/**
 * Create a watch from a description, with no model involved.
 *
 * THE OPERATOR NAMES A VALUE; ASSAY DERIVES THE SELECTOR. They paste the text
 * they can see on the page and this finds where that text sits, then builds the
 * resolver from the element's own fingerprint via `resolverFor` -- the identical
 * derivation a model-made proposal goes through. FEATURES.md F7 is "No selector
 * editing. Ever", so there is deliberately no parameter here that a CSS selector
 * could arrive in: the resolver is computed from the DOM or the field is
 * refused.
 *
 * A field whose example is not on the page is a REFUSAL, not a target created
 * hopefully. That mirrors `createTarget`, which will not start watching a field
 * it cannot see once, and it means a typo comes back as a sentence rather than
 * as a scraper that quietly never matches.
 */
export async function describeFields(input: {
  url: string;
  cadence: string;
  fields: { name: string; example: string }[];
  /** Set when the form was opened inside a conversation, so the scraper it makes belongs to one. */
  conversationId?: number;
}): Promise<BuildResult> {
  const url = input.url.trim();
  if (!/^https?:\/\//i.test(url)) return { ok: false, detail: 'That is not an http or https URL.' };
  if (!input.fields.length) return { ok: false, detail: 'Name at least one field.' };
  if (!(CADENCES as readonly string[]).includes(input.cadence)) {
    return { ok: false, detail: 'That is not a cadence Assay can schedule.' };
  }

  let html: string;
  try {
    const res = await fetch(url, { headers: { 'user-agent': 'assay/0.1 (+self-hosted)' } });
    if (!res.ok) throw new Error(`fetch ${res.status}`);
    html = await res.text();
  } catch (e) {
    return { ok: false, detail: `Could not read ${url}: ${(e as Error).message}` };
  }

  const cands = candidatesOn(html);
  const create = [];
  const missing: string[] = [];
  for (const f of input.fields) {
    const want = f.example.replace(/\s+/g, ' ').trim().toLowerCase();
    // Exact text first, then containment. Longest-text match loses to the
    // tightest one: a wrapper carrying the value plus its label is a worse
    // anchor than the element that carries only the value.
    const hit =
      cands.find((c) => (c.text ?? '').replace(/\s+/g, ' ').trim().toLowerCase() === want)
      ?? cands
        .filter((c) => (c.text ?? '').toLowerCase().includes(want))
        .sort((a, b) => a.len - b.len)[0];
    if (!hit) { missing.push(f.name); continue; }
    create.push(resolverFor(hit, f.name));
  }

  if (missing.length) {
    return {
      ok: false,
      detail: `Could not find ${missing.join(', ')} on ${url}. `
        + 'Paste the value exactly as it reads on the page -- Assay will not start '
        + 'watching a field it cannot see once.',
    };
  }

  return build(
    { url, cadence: input.cadence, fields: create },
    create.map((f) => f.name),
    input.conversationId,
  );
}
