// THE extractor. This file is the contract between the offline benchmark and the
// Bright Data Scraper Studio parser.
//
// Everything below is plain JS over a Cheerio `$`. No imports, no Node builtins,
// no npm. That is deliberate: `fingerprint()` and `skeletonHash()` paste verbatim
// into a Scraper Studio parser, where `$` is already provided. One extractor, two
// runtimes, zero drift -- an offline harness that extracts differently from
// production silently invalidates the whole benchmark.
//
// The zero-import rule now lives on the ARTIFACT, not on this source file:
// `npm run build:fingerprint` emits `dist/fingerprint.js`, and that is what gets
// pasted into Scraper Studio. `test/fingerprint-artifact.test.ts` asserts the
// emitted file contains neither `import` nor `require`. Keeping the rule here
// too is free -- there is nothing this file needs to import -- so it is kept,
// and the types below are declared locally rather than pulled from cheerio.
//
// Geometry (position, dimensions) is absent on purpose. Cheerio has no layout
// engine, so getBoundingClientRect does not exist here. PLAN.md 5 chose to drop
// those two properties (1.7 + 1.1 of ~21 weight) rather than take a browser
// dependency. The stronger claim falls out of it: no visual features, and here is
// the accuracy anyway.

// TODO(types): `$` is a CheerioAPI and `el` a domhandler Element, but naming
// either would mean importing from cheerio, and this file's whole contract is
// that it imports nothing. The shape is documented by every call site below.
type Cheerio = any;
type El = any;

/** One element, described well enough to find it again on a page that has changed. */
export interface Fingerprint {
  tag: string | null;
  id: string | null;
  id_volatile: boolean;
  classes: string[] | null;
  classes_stable: string[] | null;
  classes_dropped: number;
  text: string | null;
  neighbor_text: string | null;
  aria_label: string | null;
  name: string | null;
  type: string | null;
  href: string | null;
  alt: string | null;
  testid: string | null;
  role: string | null;
  heading_path: string[];
  parent_tag: string | null;
  depth: number;
  sibling_index: number;
  id_xpath: string | null;
  abs_xpath: string;
}

/** A fingerprint plus the selector it was reached by. */
export type SelectorFingerprint = Fingerprint & { selector: string };

const clean = (s: string | null | undefined): string => (s || '').replace(/\s+/g, ' ').trim();

// --- volatility -------------------------------------------------------------
// Found on the real corpus, day 1: IKEA ships CSS-module classes like `s1gshh7t`
// and `x1m1sl8e` next to semantic ones like `pub__typography-heading-l`, and
// anchors ids on CMS GUIDs (706aed10-9b2e-11ed-...). Both churn on every build.
// Scoring them is worse than ignoring them: a matching hash is luck, a differing
// one is noise, and both move the score for no reason. Flag them at capture time
// so the scorer can discount them rather than rediscovering this per site.

const HEX_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-/i;

/**
 * Heuristic: does this class name contain a build-generated hash segment?
 *
 * Two shapes in the wild, and an earlier version of this only caught the first:
 *   styled-components / emotion  ->  s1gshh7t, x1m1sl8e   (bare hash)
 *   CSS modules                  ->  _title_185nw_73      (name + hash + counter)
 *
 * The second was found in Bright Data Scraper Studio's own AI-generated selector
 * for this project's target page (`h1._title_185nw_73`). Treating any underscore
 * as "semantic naming" missed it entirely, which would have let the churn-prone
 * half of the class list into the score.
 *
 * Rule: split on separators; a segment that mixes letters and digits and is long
 * enough to be a hash is generated. Short segments like "v2" or "h1" are not.
 */
export function isVolatileClass(c: string | null | undefined): boolean {
  if (!c || c.length < 4) return false;
  const segs = c.split(/[-_]+/).filter(Boolean);
  if (!segs.length) return false;
  // the exclusion keeps utility classes like "3xl" / "2xs" out; it must NOT
  // swallow a hash such as "185nw", so the numeric prefix is capped at 2 digits
  return segs.some(
    (s) => s.length >= 4 && /\d/.test(s) && /[a-z]/i.test(s) && !/^\d{1,2}[a-z]{1,2}$/i.test(s)
  );
}

export function isVolatileId(id: string | null | undefined): boolean {
  if (!id) return false;
  return HEX_ID.test(id) || (id.length >= 16 && (id.match(/\d/g) || []).length >= 4);
}

/** Absolute XPath with positional predicates. Cheap, and weighted 0.3 for a reason. */
function absXPath($: Cheerio, el: El): string {
  const parts: string[] = [];
  let node = el;
  while (node && node.type === 'tag') {
    const tag = node.name;
    let i = 1;
    let sib = node.prev;
    while (sib) {
      if (sib.type === 'tag' && sib.name === tag) i++;
      sib = sib.prev;
    }
    parts.unshift(`${tag}[${i}]`);
    node = node.parent;
  }
  return '/' + parts.join('/');
}

/** XPath anchored on the nearest id ancestor. Survives wrapper-div churn above it. */
function idXPath($: Cheerio, el: El): string | null {
  const parts: string[] = [];
  let node = el;
  while (node && node.type === 'tag') {
    const id = node.attribs && node.attribs.id;
    if (id) {
      parts.unshift(`//*[@id="${id}"]`);
      return parts.join('/');
    }
    parts.unshift(node.name);
    node = node.parent;
  }
  return null;
}

/** Text of the immediately preceding and following siblings -- the label signal. */
function neighborText($: Cheerio, el: El): string {
  const $el = $(el);
  const before = clean($el.prev().text()).slice(0, 120);
  const after = clean($el.next().text()).slice(0, 120);
  const parentOwn = clean(
    $el
      .parent()
      .contents()
      .filter(function (this: El) {
        return this.type === 'text';
      })
      .text()
  ).slice(0, 120);
  return clean([before, parentOwn, after].filter(Boolean).join(' '));
}

/** Nearest enclosing headings, outermost first. Sections are stabler than classes. */
function headingPath($: Cheerio, el: El): string[] {
  const seen: string[] = [];
  let node = el;
  while (node && node.type === 'tag') {
    const $n = $(node);
    const h = $n.prevAll('h1,h2,h3,h4').first();
    if (h.length) {
      const t = clean(h.text());
      if (t && !seen.includes(t)) seen.unshift(t);
    }
    node = node.parent;
  }
  return seen.slice(-3);
}

/**
 * Describe one element well enough to find it again on a page that has changed.
 * Returns a flat object of primitives -- JSON-serialisable, diffable, storable.
 */
export function fingerprint($: Cheerio, el: El): Fingerprint {
  const $el = $(el);
  const a = el.attribs || {};

  let depth = 0;
  for (let n = el.parent; n && n.type === 'tag'; n = n.parent) depth++;

  let siblingIndex = 0;
  for (let s = el.prev; s; s = s.prev) if (s.type === 'tag') siblingIndex++;

  const allClasses = a.class ? clean(a.class).split(' ').filter(Boolean).sort() : null;
  const stable = allClasses ? allClasses.filter((c) => !isVolatileClass(c)) : null;

  return {
    tag: el.name || null,
    id: a.id || null,
    id_volatile: isVolatileId(a.id),
    classes: allClasses,
    // what the scorer should actually compare -- see isVolatileClass
    classes_stable: stable,
    classes_dropped: allClasses ? allClasses.length - stable!.length : 0,
    text: clean($el.text()).slice(0, 200) || null,
    neighbor_text: neighborText($, el) || null,
    aria_label: a['aria-label'] || null,
    name: a.name || null,
    type: a.type || null,
    href: a.href || null,
    alt: a.alt || null,
    testid: a['data-testid'] || a['data-test-id'] || a['data-qa'] || null,
    role: a.role || null,
    heading_path: headingPath($, el),
    parent_tag: el.parent && el.parent.type === 'tag' ? el.parent.name : null,
    depth,
    sibling_index: siblingIndex,
    id_xpath: idXPath($, el),
    abs_xpath: absXPath($, el),
  };
}

/** Fingerprint the first match of a selector. Null when it does not resolve. */
export function fingerprintSelector($: Cheerio, selector: string): SelectorFingerprint | null {
  const el = $(selector).get(0);
  return el ? { selector, ...fingerprint($, el) } : null;
}

/**
 * The wall this file will not go through.
 *
 * `candidates()` was unbounded: it built one array entry per element on the
 * page, and `rank()` then builds a full `fingerprint()` object -- twenty-odd
 * properties, several of them walks of their own -- for every entry. On an
 * ordinary page that is a few thousand objects. On a generated page it is the
 * page's element count, with no ceiling anywhere between here and the process
 * running out of memory.
 *
 * 20000 is deliberately far above any real document (the corpus tops out in
 * the low thousands) and far below what actually hurts. It is the same shape of
 * decision as MAX_BYTES in `src/skills/page.ts`, for the same reason: a limit
 * that refuses in one line is worth more than a limit that gets discovered when
 * a process dies with no message.
 */
export const MAX_CANDIDATE_ELEMENTS = 20000;

/**
 * Every element worth considering as a relocation candidate.
 *
 * THROWS on a page above the wall rather than ranking a truncated list. A
 * healer handed the first 20000 elements of a page would report a confident
 * score for a search it never finished, and "the best of the ones I looked at"
 * published as "the best on the page" is the exact failure this product exists
 * to refuse. Abstaining loudly is the designed answer to "I cannot do this".
 */
export function candidates($: Cheerio, root?: string | null): El[] {
  const all = $(root || 'body').find('*');
  if (all.length > MAX_CANDIDATE_ELEMENTS) {
    // Engine-side, and it stays engine-side: `web/lib/copy.ts` is imported by
    // screens and nothing under `src/` imports it, which is what stops the
    // worker, the CLI and the MCP server depending on a UI catalogue. This
    // message reaches all four.
    throw new Error(
      `this page has ${all.length} elements; Assay considers at most `
      + `${MAX_CANDIDATE_ELEMENTS}. Point the watch at a narrower page.`,
    );
  }
  const out: El[] = [];
  all.each((i: number, el: El) => {
    if (el.type !== 'tag') return;
    if (el.name === 'script' || el.name === 'style' || el.name === 'noscript') return;
    out.push(el);
  });
  return out;
}

/**
 * Structure-only page hash: tag + depth + up to 3 sorted class names, no text.
 * Content changing must NOT move this; the template changing must.
 *
 * Three knobs and they are the whole game:
 *   sorted(classes)[0..3] -- immune to class reordering and to utility-class churn
 *                            (Tailwind, CSS-module hashes). Drop classes entirely
 *                            if a target uses build-hashed names like css-1a2b3c.
 *   depthCap              -- stops deep leaf noise dominating the hash
 *   text excluded         -- this is what makes it a skeleton, not a page hash
 */
export function skeletonHash(
  $: Cheerio,
  { depthCap = 12 }: { depthCap?: number } = {},
): { hash: string; nodes: number } {
  const parts: string[] = [];
  const walk = (el: El, d: number): void => {
    if (!el || el.type !== 'tag' || d > depthCap) return;
    if (el.name === 'script' || el.name === 'style' || el.name === 'noscript') return;
    const a = el.attribs || {};
    const cls = a.class
      ? clean(a.class).split(' ').filter(Boolean).filter((c) => !isVolatileClass(c)).sort().slice(0, 3)
      : [];
    parts.push(`${d}${el.name}.${cls.join('.')}`);
    const kids = el.children || [];
    for (const k of kids) walk(k, d + 1);
  };
  walk($('body').get(0) || $.root().get(0), 0);

  // FNV-1a. A real hash function is one import we do not get in Scraper Studio.
  let h = 0x811c9dc5;
  const s = parts.join('|');
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return { hash: h.toString(16).padStart(8, '0'), nodes: parts.length };
}
