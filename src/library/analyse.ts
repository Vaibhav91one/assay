// Reading an operator's page through a tracker's prior.
//
// THE COLD START THIS REMOVES. Today an empty Assay asks you to describe, in
// prose, what you want watched -- or to name each field and paste the value it
// holds. A tracker replaces that with a click: you say "price tracker", you
// paste your URL, and this file finds the price. What you approve afterwards is
// unchanged.
//
// NO MODEL. `converse` in `src/agent/index.ts` proposes fields with one, and it
// is optional by design -- the product has to be whole with no key set. So a
// tracker's prior is DATA: a pattern that says what the value looks like, plus
// a length band. Every match below is a regex run over text that is already on
// the page, which means the same page gives the same proposal every time, on
// any machine, with or without a key.
//
// IT REUSES THE EXISTING DERIVATION AND ADDS NONE. `candidatesOn` enumerates
// the page's leaf-ish elements with their fingerprints, and `resolverFor` turns
// one of those into a `FieldInput`. Both already back the manual path in
// `web/app/(app)/watch-actions.ts`, so a tracker-made proposal and a hand-typed
// one are the same object built by the same function, and neither has a
// privileged route into the store.
//
// FEATURES.md F7 SURVIVES: there is no text box anywhere in this feature that a
// selector goes into, and the operator never sees one. The prior describes the
// VALUE, not where it sits.

import { candidatesOn, resolverFor, type Candidate } from '../agent/index.js';
import type { FieldInput } from '../setup/index.js';
import type { Tracker, TrackerField } from './index.js';

/** What the tracker found for one field, or did not. */
export interface Found {
  name: string;
  /** The text on the page, as it reads. Null when nothing matched. */
  value: string | null;
  /** The resolver derived from that element. Null when nothing matched. */
  field: FieldInput | null;
  /** How many candidates matched the pattern. 1 is the confident case. */
  matches: number;
}

export interface Analysis {
  found: Found[];
  /** Fields with a value, in tracker order. What the approval screen ticks. */
  create: FieldInput[];
}

const clean = (s: string): string => s.replace(/\s+/g, ' ').trim();

/**
 * An element's identity as one string, for `Prior.select` to match against.
 *
 * `tag#id.class.class`, from the fingerprint's own `classes_stable` -- which is
 * already this codebase's judgement about which classes survive a rebuild, so
 * this borrows it rather than inventing a second notion of stability.
 */
const identity = (c: Candidate): string =>
  `${c.tag ?? ''}${c.id ? `#${c.id}` : ''}${(c.classes_stable ?? []).map((x) => `.${x}`).join('')}`;

/**
 * Compile a field's prior.
 *
 * Patterns are STRINGS in the tracker data for the same reason resolver
 * patterns are: these end up beside things that get serialised, and a RegExp
 * literal becomes `{}` on the way through JSON. Compiled once per analysis
 * rather than per candidate -- there are up to 60 candidates and a dozen
 * fields, and building the same RegExp 700 times is silly.
 */
const compile = (f: TrackerField): RegExp => new RegExp(f.match.pattern, f.match.flags ?? 'i');

/**
 * Which candidate holds this field.
 *
 * THREE RULES, EACH ONE PUT THERE BY A PAGE THAT BROKE THE PREVIOUS VERSION.
 *
 * 1. FILTER. Length band, then the tag hint if the prior has one, then `avoid`,
 *    then `pattern`. The band is not decoration: `/\d{4}-\d{2}-\d{2}/` matches
 *    a date and it also matches a paragraph that mentions one, and on PyPI's
 *    project page the un-banded date prior matched 1,387 elements.
 *
 * 2. DROP CONTAINERS. Any hit whose text strictly contains another hit's text
 *    is discarded. On webscraper.io's product page the first element in
 *    document order matching the price prior is `div.caption`, whose text is
 *    "$24.99 Nokia 123 7 day battery" -- the card, not the price. Its child
 *    span holds "$24.99" and is the anchor a human would point at.
 *    `candidatesOn` only skips an element when a DIRECT child has identical
 *    text, so a wrapper with one extra word survives it; this is that rule
 *    extended to the matched set, where it can be applied by text rather than
 *    by ancestry.
 *
 * 3. FIRST IN DOCUMENT ORDER. Not shortest. `pickTarget` is first-match, and it
 *    is the function that will resolve this field on every run from here -- so
 *    choosing by any other rule risks a baseline established on element three
 *    and every later run reading element one. It is also just correct on real
 *    pages: books.toscrape.com lists "Price (excl. tax) £51.77", "Price (incl.
 *    tax) £51.77" and "Tax £0.00" in three identical `td`s, and shortest-wins
 *    picked the tax.
 *
 * `matches` is carried back so the screen can say when a prior was ambiguous.
 * It is the count AFTER rule 2, because containers are not competing readings.
 */
function bestFor(
  field: TrackerField,
  cands: readonly Candidate[],
): { c: Candidate; n: number } | null {
  const re = compile(field);
  const avoid = field.match.avoid ? new RegExp(field.match.avoid, field.match.flags ?? 'i') : null;
  const tags = field.match.tags?.map((t) => t.toLowerCase());

  // The site-specific half, and the only thing that makes a named tracker
  // different from the generic one: a pattern matched against the element's own
  // identity -- tag, id and the classes the fingerprint judged stable. Amazon's
  // selling price and its list price are both a rupee amount in a span; only
  // `a-color-price` tells them apart.
  const select = field.match.select ? new RegExp(field.match.select) : null;

  const hits = cands.filter((c) => {
    const t = c.text ?? '';
    if (t.length < field.match.minLen || t.length > field.match.maxLen) return false;
    if (tags && !tags.includes((c.tag ?? '').toLowerCase())) return false;
    if (select && !select.test(identity(c))) return false;
    if (avoid && avoid.test(t)) return false;
    // `test` on a `g` regex is stateful. Tracker patterns never set `g`, and
    // `test/library.test.ts` refuses one that does.
    return re.test(t);
  });
  if (!hits.length) return null;

  // ponytail: O(n²) over the matched set, not the page. The worst real case
  // measured while writing this was 1,387 hits on one PyPI page, which is under
  // two million short-string `includes` and finishes in milliseconds. The guard
  // is the length band above; if a prior ever matches tens of thousands of
  // elements the prior is wrong, not this loop.
  const inner = hits.filter((c) => {
    const t = c.text ?? '';
    return !hits.some((o) => o !== c && (o.text ?? '').length < t.length && t.includes(o.text ?? ''));
  });

  const kept = inner.length ? inner : hits;
  return { c: kept[0]!, n: kept.length };
}

/**
 * Run a tracker's priors over a page.
 *
 * Pure and read-only: HTML in, a proposal out. It fetches nothing, writes
 * nothing and consults no clock, so the caller owns the fetch and a test can
 * hand it a fixture.
 *
 * A FIELD THAT IS NOT FOUND IS REPORTED, NOT DROPPED. The screen shows the row
 * with "nothing on this page looks like one", which is a real answer about the
 * operator's page -- a product page with no stock line is a normal product
 * page. Dropping it would leave them wondering whether Assay looked.
 */
export function analyse(tracker: Tracker, html: string): Analysis {
  // `candidatesOn` defaults to 60 and takes them in document order, which on a
  // real page is sixty nav links. GitHub's status page carries its verdict at
  // candidate ~700 and PyPI's project page has 2,646 in total, so the default
  // window found nothing on either. 1,500 clears every page tested while
  // staying bounded -- the limit exists so a pathological document cannot make
  // this unbounded, not to keep the list small.
  const cands = candidatesOn(html, 1500);
  const found: Found[] = [];

  for (const f of tracker.fields) {
    const hit = bestFor(f, cands);
    if (!hit) {
      found.push({ name: f.name, value: null, field: null, matches: 0 });
      continue;
    }
    found.push({
      name: f.name,
      value: clean(hit.c.text ?? '').slice(0, 200),
      // `resolverFor` names the field, so the derived resolver carries the
      // tracker's name for the value rather than anything read off the page.
      field: resolverFor(hit.c, f.name),
      matches: hit.n,
    });
  }

  return { found, create: found.map((f) => f.field).filter((f): f is FieldInput => f !== null) };
}
