// Which element on the page is the field we are watching?
//
// This was copy-pasted into seven tools, byte-identical apart from whether the
// author spelled the whitespace squash inline or called it `clean`. One copy
// with the rule as data, because a resolver that differs between the benchmark
// and the product means the benchmark stops testing the product.
//
// Zero imports, same as fingerprint.js -- `$` is always a parameter, never a
// dependency, so this runs in a Cheerio worker and a server runtime alike.

// TODO(types): `$` is a CheerioAPI and the return an Element, but this file
// keeps fingerprint.ts's zero-import rule -- `$` is a parameter, never a
// dependency -- so neither type can be named here.
type Cheerio = any;
type El = any;

/**
 * A field contract as data: which tags could hold it, how long its text runs,
 * what must appear in it and what disqualifies it. Patterns are strings, not
 * RegExp literals -- see `compile` below.
 */
export interface FieldContract {
  tags: string;
  minLen: number;
  maxLen: number;
  include?: string | RegExp | null;
  exclude?: string | RegExp | null;
  flags?: string;
}

const clean = (s: string | null | undefined): string => (s || '').replace(/\s+/g, ' ').trim();

/**
 * The recall-title contract the corpus is built around. A contract is data:
 * which tags could hold the field, how long its text runs, what must appear in
 * it and what disqualifies it.
 */
export const RECALL_TITLE: FieldContract = {
  tags: 'h2,h3,a,li',
  minLen: 20,
  maxLen: 140,
  include: 'recall|rappel|retirada|remedy kit',
  exclude: 'recalls\\.gov|learn more|click here|^product recalls$',
  flags: 'i',
};

/**
 * Compile a contract pattern.
 *
 * Patterns are STRINGS, not RegExp literals, because a contract is stored as
 * jsonb and `JSON.stringify(/x/i)` is `{}` -- a regex written as a literal
 * silently becomes an empty object on the way to the database and matches
 * nothing on the way back. `expected.regex` in detect.js already uses the
 * string form; this is the same rule applied to the resolver.
 *
 * A RegExp is still accepted so an in-process caller can pass one.
 */
const compile = (p: string | RegExp | null | undefined, flags = 'i'): RegExp | null =>
  p == null ? null : (p instanceof RegExp ? p : new RegExp(p, flags));

/**
 * First element satisfying the contract, or null.
 *
 * Deliberately first-match rather than best-match: the baseline is captured
 * once from a page we know is good, so there is nothing to rank against yet.
 * Ranking is heal-time behaviour and lives in heal.js.
 */
export function pickTarget($: Cheerio, contract: FieldContract = RECALL_TITLE): El {
  const { tags, minLen, maxLen, flags } = contract;
  const include = compile(contract.include, flags);
  const exclude = compile(contract.exclude, flags);
  let best: El = null;
  $(tags).each((i: number, el: El) => {
    if (best) return;
    const t = clean($(el).text());
    if (t.length < minLen || t.length > maxLen) return;
    if (include && !include.test(t)) return;
    if (exclude && exclude.test(t)) return;
    best = el;
  });
  return best;
}
