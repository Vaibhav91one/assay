// A JSON record as a document the DOM engine can read.
//
// WHY THIS EXISTS. A Bright Data prebuilt scraper returns structured JSON --
// `{"user_name": "instagram", "followers": 676000000, ...}` -- and never page
// HTML (https://docs.brightdata.com/datasets/scrapers/instagram/quickstart,
// fetched 2026-08-23). Assay's engine is a DOM engine: `fingerprint` describes
// an ELEMENT, `heal` scores candidate ELEMENTS by weighted similarity, and the
// gate publishes only on `score > tau AND margin > delta`. There is no JSON in
// any of it.
//
// The two ways out were a second extraction path for JSON, or one deterministic
// rendering of the record into HTML. A second path is the wrong one and
// `src/skills/page.ts` already says why: a second path is a second set of
// checks, and the measured wrong-value rate belongs to the first set. So this
// file renders, and the engine is not told the bytes were ever JSON.
//
// AND IT IS NOT A TRICK -- the analogy holds where it has to. A renamed key
// (`followers` -> `follower_count`) becomes a changed element in this document:
// its class changes, its `<dt>` label changes, and the resolver that used to
// find it matches nothing. That is a selector break, diagnosed as one. What
// finds the field again is what finds a moved DOM element again -- position
// among siblings, the identity of the siblings, the shape of the text -- because
// those are the fingerprint fields that did not move.
//
// AND THE ABSTENTION COMES FOR FREE, which is the part that matters. If a record
// grows `follower_count` beside a surviving `followers`, two entries score
// closely, the margin is thin, and the gate abstains rather than picking one.
// That is the product's whole argument, obtained here without a line of code
// that knows what a key is. Fragility grading, the brake, contracts, blast
// radius and retraction all transfer for the same reason: none of them knows
// what a page is made of.
//
// WHAT IT COSTS, said plainly rather than discovered later:
//
//   * `candidatesOn` only considers elements whose text is 2..200 characters,
//     so a value shorter than two characters (`7`, `""`) is not a candidate and
//     cannot be watched, and one longer than 200 (a biography) is not either.
//     Padding a short value would be inventing text the vendor did not send.
//   * a JSON `null` renders as the text `null`, which is indistinguishable from
//     the string `"null"`. No key observed in Bright Data's documented records
//     is a plausible carrier of both.

/**
 * How deep the rendered document nests: not at all.
 *
 * The alternative was markup that mirrors the object -- `<dl>` inside `<dd>`
 * inside `<dl>` -- and it is worse for one specific reason. A leaf's `depth`
 * and `parent_tag` are scored fingerprint fields, so nesting makes them carry
 * the shape of the enclosing object, and wrapping one more level around an
 * outer key moves every leaf underneath it. Flattening to a dotted path keeps
 * every leaf at the same depth in the same kind of parent, whatever the object
 * did above it.
 *
 * A key ADDED IN THE MIDDLE therefore does not renumber the identity of its
 * siblings: each entry is its own `<div>`, so the `<dd>`'s `sibling_index` is 1
 * for every entry no matter how many entries precede it, and `parent_tag` is
 * always `div`. `abs_xpath` does renumber -- it is positional by definition --
 * which is why each entry also carries an `id`: `id_xpath` anchors on it and is
 * unaffected by anything inserted before it.
 *
 * An ARRAY is the honest exception. `items.0`, `items.1` -- inserting into the
 * middle of an array really does re-identify everything after it, because
 * position is the only identity an array element has. That is a fact about
 * arrays, not a shortcoming of this renderer, and the engine will read it as
 * what it is: the elements moved.
 */
const SEP = '.';

/** `&`, `<`, `>` and `"`, so vendor output cannot close a tag or an attribute.
 *  `</div>` in a biography is untrusted bytes from a third party, and this is
 *  the boundary they cross. `&` is first or it would re-escape the others. */
const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * The class and id a key path is given.
 *
 * IT MUST SURVIVE `isVolatileClass`, which is not a style preference. That
 * heuristic drops any class segment of four or more characters that mixes
 * letters and digits, because that is what a build hash looks like -- and
 * `classes_stable` is what `resolverFor` builds a resolver's selector from. A
 * dropped class would leave the resolver as a bare `dd`, which matches every
 * value in the document, and `pickTarget` is first-match: the operator would
 * silently be watching the alphabetically-first key instead of theirs. So
 * letter/digit runs are split apart (`address2line` -> `address-2-line`), which
 * leaves no segment mixing the two and nothing for the heuristic to drop.
 *
 * Pure, and deliberately not collision-free -- see `recordToHtml`, which owns
 * the disambiguation because only it can see the whole record at once.
 */
export const keyClass = (key: string): string =>
  'k-' + (key
    .toLowerCase()
    .replace(/([a-z])(\d)/g, '$1-$2')
    .replace(/(\d)([a-z])/g, '$1-$2')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'key');

/**
 * The column name a key path is watched under, or null if it cannot be one.
 *
 * `FieldName` in `src/setup/index.ts` is `/^[a-z][a-z0-9_]{0,30}$/` and becomes
 * a real column and a proof-record key, so `current_company.name` is watched as
 * `current_company_name` and `3rd_place` is not watched at all.
 *
 * NULL RATHER THAN A MANGLED FALLBACK. `keyClass` degrades a path with nothing
 * usable in it to the literal `key`, which is correct for a class -- it cannot
 * be empty -- and wrong here, because two unnameable keys would both become
 * `key` and the second would silently overwrite the first. A key that cannot be
 * a field name is a key Assay will not watch, and saying so is cheaper than
 * watching something the operator did not ask for.
 *
 * It lives beside `keyClass` because it is the same derivation: both answer
 * "what is this key path called once it has to be an identifier", and splitting
 * them across two modules is how the two answers start disagreeing.
 */
export function fieldNameFor(path: string): string | null {
  if (!/[a-z0-9]/i.test(path)) return null;
  const name = keyClass(path).slice('k-'.length).replace(/-/g, '_');
  return /^[a-z][a-z0-9_]{0,30}$/.test(name) ? name : null;
}

/**
 * The selector that addresses one key in that document.
 *
 * An ATTRIBUTE selector on the exact, unmodified path rather than `#id` or
 * `.class`, because those two are slugs and a slug is lossy: `a.b` and `a_b`
 * reduce to the same one. `data-key` carries the path as the vendor sent it, so
 * this is exact for every key including ones that collide as class names. Only
 * `"` and `\` need escaping inside a CSS attribute string.
 */
export const keySelector = (key: string): string =>
  `[data-key="${key.replace(/["\\]/g, '\\$&')}"]`;

/** One leaf: a path and the text it holds. */
interface Leaf {
  path: string;
  text: string;
}

/**
 * Every leaf of a record, in a fixed order.
 *
 * DETERMINISM IS THE WHOLE REQUIREMENT and it is why keys are sorted. A vendor
 * is under no obligation to serialise an object's keys in the same order twice,
 * and `ingestPage` skips a run whose page digest is unchanged -- so a rendering
 * that followed insertion order would make every run look like a changed page,
 * which is not merely noisy: it would put a real change and a reordering into
 * the same bucket and destroy detection outright.
 *
 * Iterative rather than recursive because the input is untrusted. A deeply
 * nested document is cheap for an attacker to send and a recursive walk turns
 * it into a stack overflow on the request thread; an explicit stack has no
 * depth to exceed, and costs the same lines.
 */
function leavesOf(record: Record<string, unknown>): Leaf[] {
  const out: Leaf[] = [];
  // Pushed in reverse so the pops come out in sorted order -- the output order
  // is the contract here, not an accident of traversal.
  const stack: { path: string; value: unknown }[] = Object.keys(record)
    .sort()
    .reverse()
    .map((k) => ({ path: k, value: record[k] }));

  while (stack.length) {
    const { path, value } = stack.pop()!;

    if (Array.isArray(value)) {
      // An empty array is a leaf, not nothing. Rendering it as absent would
      // make "the vendor sent an empty list" and "the vendor stopped sending
      // this key" the same fact, which is the silent-fallback shape this repo
      // refuses. `[]` is also two characters, so it clears `candidatesOn`.
      if (!value.length) { out.push({ path, text: '[]' }); continue; }
      for (let i = value.length - 1; i >= 0; i--) {
        stack.push({ path: `${path}${SEP}${i}`, value: value[i] });
      }
      continue;
    }

    if (value !== null && typeof value === 'object') {
      const keys = Object.keys(value as Record<string, unknown>).sort();
      if (!keys.length) { out.push({ path, text: '{}' }); continue; }
      for (let i = keys.length - 1; i >= 0; i--) {
        stack.push({ path: `${path}${SEP}${keys[i]}`, value: (value as Record<string, unknown>)[keys[i]!] });
      }
      continue;
    }

    // Values are TEXT and their type is not coerced away: 676000000 renders as
    // "676000000", true as "true", null as "null". A number turned into a
    // formatted string would be a value the vendor never sent, and the whole
    // point of this pipeline is that the published value is the observed one.
    out.push({ path, text: value === null ? 'null' : String(value) });
  }

  return out;
}

/**
 * A JSON record as a stable HTML document the DOM engine can read.
 *
 * Byte-identical for the same record, every time, on any machine: keys sorted,
 * one entry per line, no whitespace inside an entry. The `<dt>` is not
 * decoration -- it is the label, and `neighbor_text` (a scored fingerprint
 * field) reads it. A key that is renamed changes its label, which is exactly
 * the signal a renamed DOM label gives.
 *
 * Two keys whose paths reduce to the same class -- `a.b` and `a-b` -- are given
 * distinct suffixes so no two elements share an id, in the sorted order the
 * keys already have. `keySelector` is unaffected: it addresses `data-key`,
 * which is the path as the vendor sent it.
 */
export function recordToHtml(record: Record<string, unknown>): string {
  const seen = new Map<string, number>();
  const entries = leavesOf(record).map(({ path, text }) => {
    const base = keyClass(path);
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    const cls = n === 0 ? base : `${base}-dup-${n}`;
    return (
      `<div class="assay-entry">`
      + `<dt class="assay-key">${esc(path)}</dt>`
      + `<dd class="${cls}" id="${cls}" data-key="${esc(path)}">${esc(text)}</dd>`
      + `</div>`
    );
  });

  return (
    '<!doctype html>\n'
    + '<html lang="en">\n'
    + '<head><meta charset="utf-8"><title>record</title></head>\n'
    + '<body>\n'
    + '<dl class="assay-record">\n'
    + (entries.length ? `${entries.join('\n')}\n` : '')
    + '</dl>\n'
    + '</body>\n'
    + '</html>\n'
  );
}

/**
 * Whether a delivery row looks like a scraper record rather than page bytes.
 *
 * Deliberately weak, and it is the caller's LAST branch rather than its first:
 * `pageFrom` looks for HTML under the documented keys and only asks this when
 * it found none. So this never has to tell an HTML row from a record row -- it
 * only has to refuse an empty object, which would otherwise render as a
 * document with no entries and be ingested as a page that lost every field.
 */
export const isRecord = (row: unknown): row is Record<string, unknown> =>
  typeof row === 'object' && row !== null && !Array.isArray(row)
  && Object.keys(row as Record<string, unknown>).length > 0;
