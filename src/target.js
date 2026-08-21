// Which element on the page is the field we are watching?
//
// This was copy-pasted into seven tools, byte-identical apart from whether the
// author spelled the whitespace squash inline or called it `clean`. One copy
// with the rule as data, because a resolver that differs between the benchmark
// and the product means the benchmark stops testing the product.
//
// Zero imports, same as fingerprint.js -- `$` is always a parameter, never a
// dependency, so this runs in a Cheerio worker and a server runtime alike.

const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();

/**
 * The recall-title contract the corpus is built around. A contract is data:
 * which tags could hold the field, how long its text runs, what must appear in
 * it and what disqualifies it.
 */
export const RECALL_TITLE = {
  tags: 'h2,h3,a,li',
  minLen: 20,
  maxLen: 140,
  include: /recall|rappel|retirada|remedy kit/i,
  exclude: /recalls\.gov|learn more|click here|^product recalls$/i,
};

/**
 * First element satisfying the contract, or null.
 *
 * Deliberately first-match rather than best-match: the baseline is captured
 * once from a page we know is good, so there is nothing to rank against yet.
 * Ranking is heal-time behaviour and lives in heal.js.
 */
export function pickTarget($, contract = RECALL_TITLE) {
  const { tags, minLen, maxLen, include, exclude } = contract;
  let best = null;
  $(tags).each((i, el) => {
    if (best) return;
    const t = clean($(el).text());
    if (t.length < minLen || t.length > maxLen) return;
    if (include && !include.test(t)) return;
    if (exclude && exclude.test(t)) return;
    best = el;
  });
  return best;
}
