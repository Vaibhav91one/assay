// Deterministic page mutations with perfect ground truth (PLAN.md 12, arm 1).
//
// Wayback pairs are real but their ground truth is circular: the obvious label
// ("the element whose text matches") is the same signal the scorer weights most
// heavily at 2.7. Mutations avoid that entirely -- we mutate a page ourselves, so
// we know exactly which element SHOULD be found, independent of any property the
// scorer reads.
//
// The target is marked with data-assay-truth BEFORE mutation. That attribute is
// deliberately not one fingerprint() reads (it reads data-testid/data-test-id/
// data-qa), so marking cannot leak into the score.

import type { CheerioAPI } from 'cheerio';

export const TRUTH_ATTR = 'data-assay-truth';

// TODO(types): same as heal.ts -- elements come back from fingerprint.ts as
// `any` because that file may not import cheerio's types.
type El = any;

/**
 * What the correct answer is after this mutation:
 *   'target'    -> the marked element is the single correct answer
 *   'none'      -> nothing is correct; the honest answer is to abstain
 *   'ambiguous' -> a decoy exists that a naive healer may prefer
 */
export type Expectation = 'target' | 'none' | 'ambiguous';

export interface Mutation {
  id: string;
  label: string;
  expect: Expectation;
  /** Returns false when the mutation does not apply to this element. */
  apply: ($: CheerioAPI, el: El) => boolean;
}

const SWEDISH: Record<string, string> = {
  recall: 'aterkallelse', recalls: 'aterkallelser', chair: 'stol', table: 'bord',
  mirror: 'spegel', drawer: 'lada', game: 'spel', charger: 'laddare',
  hazard: 'risk', fire: 'brand', injury: 'skada', child: 'barn', due: 'grund',
  the: 'den', and: 'och', of: 'av', to: 'till', for: 'for', with: 'med',
};

const rewriteWords = (s: string | null | undefined): string =>
  (s || '').replace(/[A-Za-z]+/g, (w) => {
    const hit = SWEDISH[w.toLowerCase()];
    if (!hit) return w;
    return w[0] === w[0].toUpperCase() ? hit[0].toUpperCase() + hit.slice(1) : hit;
  });

/**
 * Each mutation returns { label, expect } where expect is:
 *   'target'  -> the marked element is the single correct answer
 *   'none'    -> nothing is correct; the honest answer is to abstain
 *   'ambiguous' -> a decoy exists that a naive healer may prefer
 */
export const MUTATIONS: Mutation[] = [
  {
    id: 'rename_class',
    label: 'rename class',
    expect: 'target',
    apply: ($, el) => {
      const $el = $(el);
      const cls = ($el.attr('class') || '').split(/\s+/).filter(Boolean);
      if (!cls.length) return false;
      $el.attr('class', cls.map((c) => `redesign-${c}`).join(' '));
      return true;
    },
  },
  {
    id: 'wrapper_div',
    label: 'insert wrapper div',
    expect: 'target',
    apply: ($, el) => {
      $(el).wrap('<div class="layout-shell"><div class="layout-inner"></div></div>');
      return true;
    },
  },
  {
    id: 'swap_tag',
    label: 'swap tag (h2 -> div, a -> span)',
    expect: 'target',
    apply: ($, el) => {
      const $el = $(el);
      const to = el.name === 'a' ? 'span' : el.name.match(/^h\d$/) ? 'div' : 'section';
      const attrs: Record<string, string> = { ...el.attribs };
      const inner = $el.html();
      const $new = $(`<${to}></${to}>`).html(inner as string);
      Object.entries(attrs).forEach(([k, v]) => $new.attr(k, v));
      $el.replaceWith($new);
      return true;
    },
  },
  {
    id: 'reorder_siblings',
    label: 'reorder siblings',
    expect: 'target',
    apply: ($, el) => {
      const $parent = $(el).parent();
      const kids = $parent.children().toArray();
      if (kids.length < 3) return false;
      $parent.empty();
      [...kids].reverse().forEach((k) => $parent.append(k));
      return true;
    },
  },
  {
    id: 'strip_id',
    label: 'strip id and data attributes',
    expect: 'target',
    apply: ($, el) => {
      const $el = $(el);
      $el.removeAttr('id');
      Object.keys(el.attribs || {})
        .filter((k) => k.startsWith('data-') && k !== TRUTH_ATTR)
        .forEach((k) => $el.removeAttr(k));
      // also strip ids on the ancestor chain, which is what kills id_xpath
      $el.parents().each((i: number, p: El) => {
        if (i < 4) $(p).removeAttr('id');
      });
      return true;
    },
  },
  {
    id: 'translate_text',
    label: 'translate visible text',
    expect: 'target',
    apply: ($, el) => {
      // rewrite the WHOLE page, not just the target -- a translated site is a
      // uniform change, and only rewriting the target would make it trivially
      // identifiable as "the odd one out"
      $('body')
        .find('*')
        .addBack()
        .contents()
        .each((i: number, n: El) => {
          if (n.type === 'text' && n.data.trim()) n.data = rewriteWords(n.data);
        });
      return true;
    },
  },
  {
    id: 'remove_field',
    label: 'remove the field entirely',
    expect: 'none', // <-- tests tau. The only correct answer is "I do not know".
    apply: ($, el) => {
      $(el).remove();
      return true;
    },
  },
  {
    id: 'duplicate_similar',
    label: 'duplicate a near-identical decoy',
    expect: 'ambiguous', // <-- tests delta. A twin sits next to the real thing.
    apply: ($, el) => {
      const $el = $(el);
      const $twin = $el.clone();
      $twin.removeAttr(TRUTH_ATTR);
      // a decoy that is close but not identical: same shape, adjacent wording
      const t = $twin.text();
      $twin.text(t.replace(/\b(\d{4})\b/, (m) => String(Number(m) + 1)) + ' (archived)');
      $el.after($twin);
      return true;
    },
  },
  {
    id: 'duplicate_longtail',
    label: 'decoy identical for 200 chars, divergent after',
    expect: 'ambiguous', // <-- pins the benign-tie prefix bug (docs/CRITIQUE.md)
    apply: ($, el) => {
      const $el = $(el);
      const base = $el.text().replace(/\s+/g, ' ').trim();
      if (!base) return false;
      // both texts share their first 200+ chars exactly; only the tail differs.
      // fingerprint() truncates text at 200, so the scorer cannot tell them apart.
      const pad = ' following reports received by the manufacturer and reviewed with the safety commission this year regarding affected production batches sold nationwide through major retailers and online channels';
      const common = (base + pad).replace(/\s+/g, ' ').slice(0, 220);
      // equal-length tails so text distance cannot separate them either
      $el.text(common + ' customers may keep using this product safely');
      const $twin = $el.clone();
      $twin.removeAttr(TRUTH_ATTR);
      $twin.text(common + ' customers must stop using this product today');
      // twin takes the target's original position, inheriting its xpath and
      // neighbours -- the decoy is the BETTER structural match, deliberately
      $el.before($twin);
      return true;
    },
  },
  {
    id: 'combo_redesign',
    label: 'combo: wrapper + class rename + tag swap',
    expect: 'target',
    apply: ($, el) => {
      const $el = $(el);
      const cls = ($el.attr('class') || '').split(/\s+/).filter(Boolean);
      if (cls.length) $el.attr('class', cls.map((c) => `v2-${c}`).join(' '));
      $el.wrap('<div class="v2-shell"></div>');
      return true;
    },
  },
];

/** Mark the ground-truth element so we can recognise it after mutation. */
export function markTarget($: CheerioAPI, el: El): void {
  $(el).attr(TRUTH_ATTR, '1');
}

export function isTarget(el: El): boolean {
  return !!(el && el.attribs && el.attribs[TRUTH_ATTR]);
}
