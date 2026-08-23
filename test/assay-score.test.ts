// The Assay Score: one word for what the gate decided, and no number anywhere.
//
// Two halves, and the second is the load-bearing one.
//
// The first half checks the mapping: every reason `healGated` can return, the
// two a policy can override it with, and the codes that must NOT become a word.
// That is ordinary table-checking and it would be worth having on its own.
//
// The second half checks the PROPERTY THE WHOLE FEATURE RESTS ON -- that no
// score, margin, tau or delta reaches the browser from the surfaces that draw a
// decision. docs/FEATURES.md §4 refuses a confidence float on three grounds,
// and the band only answers them for as long as it is the ONLY thing on the
// screen; a band beside `0.7354` is the anti-feature with a label on it. That
// is not something review can be relied on to catch, because it comes back one
// helper at a time -- a `toFixed` here, a `τ {d.tau}` there, each of them
// locally reasonable. So it is asserted mechanically, in two ways:
//
//   * against real OUTPUT, for `web/lib/run-flow.ts`, which is pure and can be
//     run: every node summary, fact value and edge label, over every reason.
//   * against SOURCE, for the components, which cannot be rendered here without
//     teaching this runner the whole Next config and starting shiki. Same call
//     `test/button-recipe.test.ts` makes and for the same reason -- and for
//     this property a source scan is the stronger check anyway, since it fails
//     on a number the component COULD print rather than only on one some
//     fixture happened to make it print.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { bandFor, BAND_MEANS, ASSAY_SCORE_DOC, type Band } from '../src/reports/assay-score.js';
import { flowFor, type CellRecord, type RunRecord } from '../web/lib/run-flow.js';

const ROOT = new URL('../', import.meta.url).pathname;
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

/* --------------------------------------------------------------- the map */

describe('every reason the store can hold maps to one word', () => {
  // The five `healGated` returns, from src/heal.ts:229-230. If a sixth is ever
  // added, this table is where it has to be answered for.
  it.each([
    ['clear_margin', 'CLEAR'],
    ['benign_tie', 'AGREED'],
    ['thin_margin', 'THIN'],
    ['below_tau', 'WEAK'],
    ['no_candidates', 'GONE'],
  ] as const)('%s is %s', (reason, band) => {
    expect(bandFor(reason)).toBe(band);
  });

  it('gives a policy withhold its own word, not the gate verdict underneath it', () => {
    // src/runner.ts:230-240. The gate said heal; the contract's auto-approve
    // floor withheld it. An operator reading THIN on a field they set to
    // `auto_approve: never` is being told the wrong thing about their own
    // configuration, which is exactly why `field_runs.reason` stores the
    // override rather than `g.reason`.
    expect(bandFor('auto_approve_floor:0.9')).toBe('POLICY');
    expect(bandFor('auto_approve_floor:1')).toBe('POLICY');
  });

  it('gives the brake its own word', () => {
    // The exact string, from the caller: `healBlockFor` in
    // src/connectors/ingest.ts:91 passes `'brake_engaged'` when `shouldHeal`
    // returns false. Not guessed, and not `brake` or `braked`.
    expect(bandFor('brake_engaged')).toBe('BRAKED');
  });

  it('does not call an unreadable brake a brake', () => {
    // ingest.ts:97, the fail-closed branch: the brake table could not be READ.
    // Nobody may have stopped this field. BRAKED would send the operator to
    // clear a brake that does not exist while the real fault -- an unreachable
    // database -- goes unnamed, so there is no word for it and the raw code
    // prints instead.
    expect(bandFor('brake_unreadable:connection refused')).toBeNull();
  });

  it('refuses to invent a word for a code it does not know', () => {
    // The failure this returns null to prevent: a reason added to the engine
    // reaching a build whose table predates it, and being confidently rendered
    // as whichever band a `??` fallback happened to name.
    for (const s of ['', 'probe_failed', 'unknown', 'THIN', 'clear margin', 'auto_approve_floor'])
      expect(bandFor(s)).toBeNull();
    expect(bandFor(null)).toBeNull();
    expect(bandFor(undefined)).toBeNull();
  });
});

describe('the words explain themselves', () => {
  const BANDS: Band[] = ['CLEAR', 'AGREED', 'THIN', 'WEAK', 'GONE', 'POLICY', 'BRAKED'];

  it('has a sentence for every band and a band for every sentence', () => {
    // The badge and /docs/assay-score render this same table. A band with no
    // sentence would draw a word with nothing behind it on both.
    expect(Object.keys(BAND_MEANS).sort()).toEqual([...BANDS].sort());
    for (const b of BANDS) expect(BAND_MEANS[b].length).toBeGreaterThan(20);
  });

  it('quotes no number in any of them', () => {
    // The sentences are the user-facing half of the feature. A threshold or a
    // percentage in one of them is the float arriving through the copy.
    for (const b of BANDS) expect(BAND_MEANS[b]).not.toMatch(/\d|%|τ|δ/);
  });

  it('points at a docs page that exists', () => {
    expect(ASSAY_SCORE_DOC).toBe('/docs/assay-score');
    const page = read('web/content/docs/assay-score.mdx');
    // The page is the whole justification for hiding the numbers, so it has to
    // carry every word it is explaining.
    for (const b of BANDS) expect(page).toContain(b);
    expect(JSON.parse(read('web/content/docs/meta.json')).pages).toContain('assay-score');
  });
});

/* ------------------------------------------------- no number on the screen */

/**
 * Anything that reads as a score, a margin, a threshold or a percentage.
 *
 * NOT "any decimal". This diagram legitimately prints `77.6 kB`, and banning
 * every float would make the check pass by making the screen useless. What §4
 * refuses is a measure of how SURE the engine was, and all four of those live
 * in `[0, 1]` -- so the first pattern catches every one of them by their range,
 * and the second catches the four-place formatting they were printed with,
 * including the `1.0000` a sole candidate's margin takes.
 */
const NUMERIC = [
  /\b0\.\d/, //         0.7354, 0.6, 0.16 -- a score, margin, tau or delta
  /\d\.\d{3,}/, //      formatted to four places, which is how they were printed
  /τ|δ/, //             the thresholds by their symbols
  /%/, //               a percentage, which §4 refuses by name
];

describe('the run diagram renders no arithmetic', () => {
  const cell = (over: Partial<CellRecord> = {}): CellRecord => ({
    field: 'recall_title',
    value: null,
    status: 'quarantined',
    reason: 'thin_margin',
    proofId: 'pr_951651de7ed06167',
    goldenSha: 'gggg0000',
    captureSha: 'cccc0000',
    ranked: [
      { selector: 'h2', score: 0.7354, value: 'Recall & Safety Alerts' },
      { selector: 'h2', score: 0.6096, value: 'Recall & Safety Alerts (archived)' },
    ],
    heldSinceRun: 61,
    groupKey: 'aa1afd70:recall_title',
    heal: null,
    queueOpen: true,
    episodeId: null,
    ...over,
  });

  const run = (over: Partial<CellRecord>): RunRecord => ({
    runId: 61,
    targetId: 'mattel',
    url: 'corpus://mattel',
    startedAt: new Date('2026-08-22T12:00:00Z'),
    status: 'abstain',
    pageBytes: 79_479,
    pageSha: 'aaaa111122223333',
    skeletonHash: 'aa1afd70',
    captureKept: true,
    previous: { runId: 60, pageSha: 'bbbb444455556666' },
    thresholds: { tau: 0.6, delta: 0.16 },
    thresholdsDeclared: true,
    firstForField: false,
    cell: cell(over),
  });

  // Every reason a held cell can carry, plus the two published arms. The whole
  // point is that NO branch draws a number, so every branch is walked.
  const REASONS = [
    'thin_margin', 'below_tau', 'no_candidates',
    'auto_approve_floor:0.9', 'brake_engaged', 'brake_unreadable:ECONNREFUSED',
  ];

  it.each(REASONS)('holds on %s without quoting a score', (reason) => {
    const flow = flowFor(run({ reason }));
    // Every string this module puts on the screen: card titles, the one-line
    // summaries, both halves of each branch, every fact value, every edge label.
    //
    // ONE EXEMPTION, and it is narrow: the fact sourced to `field_runs.reason`,
    // which is the raw code quoted verbatim in the machine-token column. Two of
    // the codes carry a number -- `auto_approve_floor:0.9` and
    // `brake_unreadable:<message>` -- and in both cases it belongs to the code
    // rather than to the page: the floor is the operator's OWN contract value
    // read back to them, not a measurement of how sure the engine was. Trimming
    // it would be inventing a reason code, which `src/reports/vocabulary.ts`
    // refuses for the same reason it refuses inventing wordings.
    const drawn = [
      ...flow.nodes.flatMap((n) => [
        n.title, n.summary, n.branch?.taken ?? '', n.branch?.notTaken ?? '',
        ...n.facts.filter((f) => f.source !== 'field_runs.reason').map((f) => f.value),
      ]),
      ...flow.edges.map((e) => e.label),
    ];
    for (const s of drawn) for (const bad of NUMERIC) expect(s).not.toMatch(bad);
  });

  it('publishes without quoting one either', () => {
    const flow = flowFor({
      ...run({}),
      status: 'heal',
      cell: cell({ status: 'healed', value: 'x', reason: null, ranked: null,
        heal: { from: 'a', to: 'h2.title' } }),
    });
    const drawn = flow.nodes.flatMap((n) => [n.summary, ...n.facts.map((f) => f.value)]);
    for (const s of drawn) for (const bad of NUMERIC) expect(s).not.toMatch(bad);
  });

  it('still shows the page size, which is not a score', () => {
    // The guard above must not be read as "no digits anywhere". A page is
    // 79.5 kB and a run has an id, and neither invites anyone to threshold it.
    // What §4 refuses is a measure of CONFIDENCE, and the check above is shaped
    // to catch that -- so this asserts the diagram did not go silent instead.
    const facts = flowFor(run({})).nodes.flatMap((n) => n.facts);
    expect(facts.find((f) => f.label === 'page size')!.value).toBe('77.6 kB');
    expect(facts.find((f) => f.label === 'reason')!.value).toBe('thin_margin');
  });
});

describe('the diff components cannot print a score', () => {
  /**
   * The source with its comments removed.
   *
   * This file's own reasoning lives in its comments, and several of them quote
   * the numbers they removed on purpose ("it used to print 0.7354"). Stripping
   * them is what makes the assertion about what RENDERS rather than about what
   * the file says.
   */
  const code = (file: string) =>
    read(file)
      .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');

  /** Every component that draws a gate decision, and nothing else. */
  const SURFACES = [
    ...readdirSync(join(ROOT, 'web/components/diff'))
      .filter((f) => f.endsWith('.tsx'))
      .map((f) => `web/components/diff/${f}`),
    'web/components/assay-score.tsx',
  ];

  it('covers the components that actually exist', () => {
    // A new file under web/components/diff/ is picked up by the glob above, so
    // this only has to prove the glob found the two that were there when the
    // band replaced their numbers.
    expect(SURFACES).toContain('web/components/diff/extractor-diff.tsx');
    expect(SURFACES).toContain('web/components/diff/schema-diff.tsx');
  });

  // Each pattern is one of the ways the number was on the screen before: a
  // float formatter, a threshold by its symbol or its name, a percentage, or a
  // read of the two fields the arithmetic lands on.
  const BANNED: [RegExp, string][] = [
    [/toFixed\s*\(/, 'a float formatter'],
    [/τ|δ/, 'a threshold symbol'],
    [/\d\s*%|percent/i, 'a percentage'],
    [/\btau\b/, 'tau'],
    [/\bdelta\b/, 'delta'],
    [/\.margin\b/, 'the margin'],
    [/\.score\b/, 'a score'],
  ];

  for (const file of SURFACES) {
    const src = code(file);
    for (const [pattern, what] of BANNED) {
      it(`${file} renders no ${what}`, () => {
        expect(src, `${file} still reaches for ${what}`).not.toMatch(pattern);
      });
    }
  }

  it('leaves nothing behind in the gate section of the run screen', () => {
    // Scoped to the four things that WERE there rather than to a blanket ban on
    // digits: this page also prints a page size in kB and a run id, and neither
    // of those is a confidence float. What §4 refuses is a measure of how sure
    // the engine was, and these are the five ways this screen expressed it --
    // a score column, a proportional bar beside it, and the two thresholds it
    // was compared against.
    const src = code('web/app/(app)/runs/[run]/page.tsx');
    expect(src).not.toMatch(/τ|δ/);
    expect(src).not.toMatch(/gate\.(score|margin|tau|delta)/);
    expect(src).not.toMatch(/c\.score/);
    expect(src).not.toMatch(/<Bar\b/);
  });

  it('draws the band through the one component, never inline', () => {
    // Two surfaces drawing a band their own way is how the two surfaces came to
    // disagree about which threshold had failed in the first place.
    const diff = read('web/components/diff/extractor-diff.tsx');
    const page = read('web/app/(app)/runs/[run]/page.tsx');
    expect(diff).toContain('<AssayScore');
    // ONCE PER SCREEN. The run page draws the selector diff and the gate's
    // candidate list, and for a while it drew a band above both -- the same
    // decision stated twice, forty pixels apart, which is the duplicated fact
    // docs/APP-DESIGN.md §5b calls P2. It belongs on the diff: a run held on
    // `no_candidates` has an empty `ranked` and so no gate section at all,
    // while the diff renders on every held run.
    expect(page).not.toContain('<AssayScore');
    // The WORDING is drawn in exactly one place. Reading `BAND_MEANS` anywhere
    // else is a second surface deciding what a band says, which is what one
    // component exists to prevent. (Comparing against a band -- the THIN-only
    // rivals block -- is a branch, not a rendering, and is fine.)
    for (const src of [diff, page]) expect(src).not.toContain('BAND_MEANS');
    expect(read('web/components/assay-score.tsx')).toContain('BAND_MEANS[band]');
  });

  it('sends every band to the docs page', () => {
    // The promise the hidden numbers rest on: a word can always be turned back
    // into the arithmetic. It is kept by the badge and only by the badge, so
    // the link has to be on the badge itself rather than beside it.
    const badge = read('web/components/assay-score.tsx');
    expect(badge).toContain('ASSAY_SCORE_DOC');
    expect(badge).toMatch(/href=\{ASSAY_SCORE_DOC\}/);
  });
});
