// Engine words, and the plain English a reader gets instead.
//
// APP-DESIGN 5b rule 5: a reason code never reaches the user raw. But a code
// with no wording here must not be given an invented one either -- an incident
// record whose whole value is that it does not fabricate cannot start by
// fabricating an adjective. So the lookup returns null on a miss and the
// renderer prints the code as a code, marked as untranslated.

export interface Term {
  code: string;
  /** Null when this code has no wording here. Never a guess. */
  plain: string | null;
}

// src/heal.ts: the four decisions the gate can record against a cell.
//
// Exported because the browser renders these wordings too, and this file
// imports nothing -- so a client component can read the table itself rather
// than keeping a second copy of it. It stays a plain lookup: a code with no
// wording here is printed AS a code, never given an invented one.
export const HELD_BECAUSE: Record<string, string> = {
  thin_margin: 'two candidates on the page were too close to call',
  below_tau: 'nothing on the page looked enough like this field to be a candidate',
  no_candidates: 'the element is gone and nothing took its place',
  // src/runner.ts's blocked branch: not a gate refusal, a fetch that never
  // got page content to gate on. Shares this table because `field_runs.reason`
  // is the one column both write to, and `heldBecause()` is the one lookup
  // every screen already reads it through.
  fetch_blocked: 'the site blocked the request before any page content came back',
};

// src/detect.ts: what the detector attributed the break to.
const CAUSE: Record<string, string> = {
  ok: 'nothing in the page structure moved',
  selector_break: 'the element it had been reading is gone',
  semantic_drift: 'the anchors around it stopped agreeing',
  wrong_value: 'the value stopped looking like this field',
  unknown: 'the page moved in a way the detector could not attribute',
  // The fetch itself failed to reach the page (Cloudflare or similar), so
  // there was nothing to detect drift IN -- a different fact from every code
  // above, all of which describe a page that was successfully read.
  blocked: 'the site refused the request before any content came back',
};

// queue_items.resolution: what the human chose. `model_nominated:<n>` is
// deliberately absent -- that is a nomination on an open item, not a decision,
// and it is read from resolved_by, never from here.
const RESOLUTION: Record<string, string> = {
  first: 'the first candidate was the right one',
  second: 'the second candidate was the right one',
  empty: 'the field was to be left empty',
  neither: 'neither candidate was right',
};

const term = (table: Record<string, string>) => (code: string | null | undefined): Term | null =>
  code == null ? null : { code, plain: table[code] ?? null };

export const heldBecause = term(HELD_BECAUSE);
export const causeOf = term(CAUSE);
export const resolutionOf = term(RESOLUTION);

/**
 * A timestamp as a Date, whatever the driver handed back.
 *
 * Raw `execute` returns a timestamptz as a string on some paths and a Date on
 * others. Left alone, the types here would claim Date and the REST surface
 * would emit two different date formats depending on which query produced the
 * row. Normalised once, at the edge of every composition.
 *
 * Null in, null out: a missing timestamp stays missing rather than becoming the
 * epoch, and an unparseable one is an absence too, not a wrong instant.
 */
export function asDate(v: Date | string | null | undefined): Date | null {
  if (v == null) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "22 Aug 2026, 02:17 UTC" -- one reading, everywhere, forever. */
const FMT = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric', month: 'short', year: 'numeric',
  hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC',
});

export function when(at: Date | string | null | undefined): string | null {
  const d = asDate(at);
  return d == null ? null : `${FMT.format(d).replace(',', '')} UTC`;
}
