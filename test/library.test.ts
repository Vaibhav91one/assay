// The tracker library.
//
// Every assertion here exists because the failure it catches would be silent
// and would land on a first-time operator. A tracker whose emitted contract
// does not parse fails at APPROVE time, after somebody has pasted a URL, seen
// values and pressed the button. A prior that finds a nav link instead of a
// price fails worse: it succeeds, and the operator watches the wrong thing.
//
// Pure: no Postgres, no clock, and NO NETWORK. The discovery tests run against
// HTML fixtures committed under `test/fixtures/library/` rather than against the
// live sites, because a test that fetched GitHub would fail on a train and a red
// CI meaning "someone else's site changed" is a red CI people learn to ignore.
// The fixtures are what those pages actually served on the date in the tracker.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  TRACKERS, GROUPS, RULED_OUT, trackerById, evidenceOf, thresholdsOf, NOT_MEASURED,
  CHANGE_NOT_CONDITION,
} from '../src/library/index.js';
import { analyse } from '../src/library/analyse.js';
import { contractFor } from '../src/library/contract.js';
import { formatIssues, parseContract, thresholdsFor, TIERS } from '../src/contracts/index.js';
import { CreateInput, FieldName, targetIdFor } from '../src/setup/index.js';

const fixture = (name: string): string =>
  readFileSync(new URL(`./fixtures/library/${name}.html`, import.meta.url), 'utf8');

describe('every tracker is applicable', () => {
  it('emits a contract that ContractSchema accepts, for every field', () => {
    for (const t of TRACKERS) {
      for (const f of t.fields) {
        const targetId = targetIdFor('example', f.name);
        const r = parseContract(contractFor(f, targetId));
        // The message carries the tracker and the field, because a bare
        // "invalid contract" in CI sends someone to read all of them.
        if (!r.ok) throw new Error(`${t.id}.${f.name}: ${formatIssues(r.issues)}`);
        expect(r.contract.target).toBe(targetId);
        expect(Object.keys(r.contract.fields)).toEqual([f.name]);
        expect(r.contract.fields[f.name]!.policy).toBe(f.policy);
      }
    }
  });

  it('names fields the create path will accept', () => {
    // `FieldName` is what `CreateInput` enforces. A tracker naming a field
    // `Latest Version` is refused by `createTarget` -- after the operator has
    // pasted a URL and pressed the button.
    for (const t of TRACKERS) {
      for (const f of t.fields) {
        expect(FieldName.safeParse(f.name).success, `${t.id}.${f.name}`).toBe(true);
      }
    }
  });

  it('names a cadence the approval form can actually offer', async () => {
    // Not `cadenceMs`, which is the looser test: the select is built from
    // `CADENCES` and `build` validates against the same enum, so a cadence
    // outside it renders as whatever happens to be first and is then refused
    // on submit.
    const { CADENCES } = await import('../src/agent/models.js');
    for (const t of TRACKERS) {
      expect(CADENCES, `${t.id} cadence ${t.cadence}`).toContain(t.cadence);
    }
  });

  it('compiles every prior, and none of them is global', () => {
    for (const t of TRACKERS) {
      for (const f of t.fields) {
        // A `g` regex carries `lastIndex` between `test` calls, and `analyse`
        // reuses one compiled pattern across hundreds of candidates -- so a
        // global flag would make the result depend on how many elements came
        // before, which is the worst kind of bug to find in production.
        expect(f.match.flags ?? '', `${t.id}.${f.name} flags`).not.toContain('g');
        expect(() => new RegExp(f.match.pattern, f.match.flags ?? 'i')).not.toThrow();
        if (f.match.avoid) {
          expect(() => new RegExp(f.match.avoid!, f.match.flags ?? 'i')).not.toThrow();
        }
        expect(f.match.maxLen, `${t.id}.${f.name} band`).toBeGreaterThan(f.match.minLen);
      }
    }
  });

  it('is internally consistent: unique ids, unique fields, a real group, prose everywhere', () => {
    expect(TRACKERS.length).toBeGreaterThan(0);
    expect(new Set(TRACKERS.map((t) => t.id)).size).toBe(TRACKERS.length);
    const groups = new Set(GROUPS.map((g) => g.id));

    for (const t of TRACKERS) {
      expect(trackerById(t.id)).toBe(t);
      // A tracker in no group renders nowhere: the list is drawn group by group.
      expect(groups.has(t.group as never), `${t.id} group "${t.group}"`).toBe(true);
      expect(t.fields.length, `${t.id} has no fields`).toBeGreaterThan(0);
      expect(new Set(t.fields.map((f) => f.name)).size, `${t.id} repeats a field`)
        .toBe(t.fields.length);

      // Every sentence a screen prints has to exist. An empty one renders as a
      // gap that reads like a bug rather than like a decision.
      for (const [key, value] of Object.entries({
        name: t.name, summary: t.summary, needs: t.needs, mismatch: t.mismatch,
      })) {
        expect(value.trim().length, `${t.id}.${key} is empty`).toBeGreaterThan(0);
      }

      for (const f of t.fields) {
        expect(TIERS).toContain(f.policy);
        for (const [key, value] of Object.entries({ means: f.means, why: f.why })) {
          expect(value.trim().length, `${t.id}.${f.name}.${key} is empty`).toBeGreaterThan(0);
        }
      }
    }
  });
});

describe('a prior finds the value a person would point at', () => {
  /**
   * The test that matters most, and the only one that could not be written
   * without real pages.
   *
   * A tracker that proposes SOMETHING is not a tracker that works -- it is a
   * tracker that has found a nav link. Each case below names the page, the
   * field, and the exact string the operator should end up watching. Every one
   * of these was a real failure at some point while this was being written:
   * the tax line beat the price, a site menu beat a recall headline, a
   * per-component row beat a service's overall verdict.
   */
  const CASES: { fixture: string; tracker: string; field: string; value: string }[] = [
    // books.toscrape.com prints "Price (excl. tax) £51.77", "Price (incl. tax)
    // £51.77" and "Tax £0.00" in three identical cells. Shortest-match picked
    // the tax; the `avoid` on zero amounts and document order fixed it.
    { fixture: 'books-product', tracker: 'price', field: 'price', value: '£51.77' },
    { fixture: 'books-product', tracker: 'price', field: 'availability', value: 'In stock (22 available)' },
    { fixture: 'books-product', tracker: 'restock', field: 'availability', value: 'In stock (22 available)' },
    // The first element matching the price prior here is the whole product
    // card, "$24.99 Nokia 123 7 day battery". The containment filter in
    // ./analyse.ts is what leaves the span behind.
    { fixture: 'webscraper-product', tracker: 'price', field: 'price', value: '$24.99' },
    { fixture: 'gh-releases', tracker: 'release', field: 'version', value: '2026-08-05, Version 26.7.0 (Current), @aduh95' },
    // "All Systems Operational" contains "Operational", which a component row
    // also carries -- so containment alone dropped the headline. The `tags`
    // hint on the status prior is what keeps the verdict.
    { fixture: 'gh-status', tracker: 'status', field: 'status', value: 'All Systems Operational' },
    { fixture: 'anthropic-status', tracker: 'status', field: 'status', value: 'All Systems Operational' },
    // The site menu on this page reads "Home Shop Recalls Support About" and
    // matched the recall prior before `avoid` and the tag hint existed.
    { fixture: 'testbed-recalls', tracker: 'recall', field: 'recall_title', value: 'Contoso recalls the Halden swivel chair after reports of falls' },
    { fixture: 'testbed-recalls', tracker: 'recall', field: 'notice_date', value: '2026-04-18' },
    { fixture: 'wikipedia-article', tracker: 'revision', field: 'last_changed', value: 'This page was last edited on 9 August 2026, at 08:53 (UTC).' },
    { fixture: 'mdn-page', tracker: 'revision', field: 'last_changed', value: 'This page was last modified on Jun 22, 2026 by MDN contributors.' },
  ];

  for (const c of CASES) {
    it(`${c.tracker}.${c.field} on ${c.fixture}`, () => {
      const t = trackerById(c.tracker);
      expect(t, `no tracker "${c.tracker}"`).toBeDefined();
      const found = analyse(t!, fixture(c.fixture)).found.find((f) => f.name === c.field);
      expect(found, `${c.field} is not a field of ${c.tracker}`).toBeDefined();
      expect(found!.value).toBe(c.value);
      // And the derived resolver has to be something `createTarget` accepts,
      // or the proposal is a screen that cannot be approved.
      expect(found!.field).not.toBeNull();
    });
  }

  it('reports a field it cannot find rather than proposing something else', () => {
    // A Wikipedia article has no price on it. The price tracker has to say so:
    // the alternative is a watch on whatever else matched, which is the failure
    // mode this whole product is built to refuse.
    const priced = analyse(trackerById('price')!, fixture('wikipedia-article'));
    const price = priced.found.find((f) => f.name === 'price')!;
    expect(price.value).toBeNull();
    expect(price.field).toBeNull();
    expect(priced.create.map((f) => f.name)).not.toContain('price');
  });

  it('assembles a CreateInput the boundary accepts, from a real page', () => {
    // The end of the argument: not each field in isolation, but the body
    // `approve` actually posts.
    const t = trackerById('price')!;
    const a = analyse(t, fixture('books-product'));
    const r = CreateInput.safeParse({
      url: 'https://example.com/p',
      cadence: t.cadence,
      fields: a.create,
    });
    if (!r.success) throw new Error(r.error.message);
    expect(a.create.length).toBeGreaterThan(0);
  });
});

describe('an example page has to say why it is named', () => {
  const ISO = /^\d{4}-\d{2}-\d{2}$/;

  it('carries a permission sentence and a date on every example', () => {
    // This repository is public and MIT. Naming a URL without recording what
    // was checked would make the list an assertion instead of an argument, and
    // the entry screen prints these.
    for (const t of TRACKERS) {
      for (const x of t.examples) {
        expect(x.url.startsWith('http'), `${t.id} ${x.url}`).toBe(true);
        expect(x.label.trim().length, `${t.id} example label`).toBeGreaterThan(0);
        expect(x.permission.trim().length, `${t.id} ${x.url} permission`).toBeGreaterThan(60);
        expect(x.checked, `${t.id} ${x.url} checked`).toMatch(ISO);
      }
    }
  });

  it('records what was ruled out, and why, rather than dropping it', () => {
    // The rejections are the more useful half of a short list: they are the
    // answer to "why not X", which is the first question it gets.
    expect(RULED_OUT.length).toBeGreaterThan(0);
    for (const r of RULED_OUT) {
      expect(r.site.trim().length).toBeGreaterThan(0);
      expect(r.failed.trim().length).toBeGreaterThan(0);
      expect(r.detail.trim().length).toBeGreaterThan(60);
    }
  });
});

describe('a tier on a screen is the tier the engine will use', () => {
  /**
   * The bridge. A screen showing "strict · tau 0.70 · delta 0.20" beside a
   * tracker whose stored contract resolved to something else would be a lie
   * about the setting the tracker was chosen for. This runs the tracker's OWN
   * emitted contract through the engine's OWN resolver and compares it to what
   * the screen displays, so the two cannot drift without CI noticing.
   */
  it('round-trips through parseContract and thresholdsFor to the displayed numbers', () => {
    for (const t of TRACKERS) {
      for (const f of t.fields) {
        const r = parseContract(contractFor(f, targetIdFor('slug', f.name)));
        expect(r.ok).toBe(true);
        if (!r.ok) continue;

        const resolved = thresholdsFor(r.contract, f.name);
        const shown = thresholdsOf(f);
        expect(resolved.policy, `${t.id}.${f.name}`).toBe(f.policy);
        expect(resolved.tau, `${t.id}.${f.name} tau`).toBe(shown.tau);
        expect(resolved.delta, `${t.id}.${f.name} delta`).toBe(shown.delta);
      }
    }
  });
});

describe('no tracker claims evidence it does not have', () => {
  it('carries a measured record on exactly one field, and it is recall_title', () => {
    const measured = TRACKERS.flatMap((t) =>
      t.fields.filter((f) => f.evidence !== null).map((f) => `${t.id}.${f.name}`));
    // Not a style rule. `corpus/` holds ikea, mattel and chicco, and the
    // benchmark is one field across them (docs/LIMITATIONS.md 4). A second
    // measured field appearing here means somebody attached a number to a
    // tracker it was never run against, which is the failure this file exists
    // to catch. The day somebody DOES run it, this line gets edited -- which is
    // the point: the claim cannot be gained by accident.
    expect(measured).toEqual(['recall.recall_title']);

    const totals = TRACKERS.reduce(
      (a, t) => {
        const e = evidenceOf(t);
        return { measured: a.measured + e.measured, total: a.total + e.total };
      },
      { measured: 0, total: 0 },
    );
    expect(totals.measured).toBe(1);
    expect(totals.total).toBe(TRACKERS.flatMap((t) => t.fields).length);
  });

  it('is the field the benchmark actually ran, on the pair it ran at', () => {
    // What makes the claim attachable rather than borrowed. `recall_title`
    // declares `normal`; the gated arm in results/bench.json ran at
    // tau 0.60 / delta 0.16; `normal` has to resolve to exactly that.
    const f = trackerById('recall')!.fields.find((x) => x.name === 'recall_title')!;
    const r = parseContract(contractFor(f, targetIdFor('slug', 'recall_title')));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const resolved = thresholdsFor(r.contract, 'recall_title');
    expect(resolved.tau).toBe(0.60);
    expect(resolved.delta).toBe(0.16);
    // And the prior is RECALL_TITLE's own include pattern, which is the
    // contract those runs used. If somebody widens it, the claim stops being
    // about the thing that was measured.
    expect(f.match.pattern).toContain('recall');
    expect(f.match.pattern).toContain('rappel');
    expect(f.match.pattern).toContain('retirada');
  });

  it('cites files that exist and numbers that are still in them', () => {
    const f = trackerById('recall')!.fields.find((x) => x.name === 'recall_title')!;
    const ev = f.evidence!;
    for (const path of ev.source.split(',').map((s) => s.trim())) {
      // Read, not stat: a claim citing an empty file is a claim with no
      // evidence behind it dressed as one with evidence behind it.
      expect(readFileSync(path, 'utf8').length, path).toBeGreaterThan(0);
    }

    const bench = JSON.parse(readFileSync('results/bench.json', 'utf8')) as {
      arms: Record<string, {
        n: number; value_wrong: number; abstain_right: number; abstain_wrong: number;
      }>;
    };
    const gated = bench.arms.gated!;
    expect(gated.n).toBe(153);
    expect(gated.value_wrong).toBe(0);
    expect((((gated.abstain_right + gated.abstain_wrong) / gated.n) * 100).toFixed(1)).toBe('35.3');
    expect(readFileSync('results/events.jsonl', 'utf8').trim().split('\n').length).toBe(74);

    // If a number above moves, the sentence on the screen becomes wrong and
    // this fails rather than the screen quietly lying.
    expect(ev.claim).toContain('153');
    expect(ev.claim).toContain('0 wrong');
    expect(ev.claim).toContain('35.3%');
    expect(ev.claim).toContain('74 recorded runs');
    expect(ev.claim).toContain('healed 66');
    // And the sentence that stops it being read as a claim about your page.
    expect(ev.claim).toContain('not a claim about your page');
  });

  it('does not promise an alert on a condition, because nothing reads one', () => {
    // `FieldPolicy.alert` is written and resolved and never consumed, and an
    // episode is opened by a BREAK. So there is no threshold input anywhere in
    // this feature, and this pins that: if somebody adds one, the sentence the
    // screens print becomes a lie and they have to change it here first.
    expect(CHANGE_NOT_CONDITION).toContain('does not yet fire');
    expect(CHANGE_NOT_CONDITION).toContain('no box here');
  });

  it('says the same thing about every unmeasured field, from one place', () => {
    // `NOT_MEASURED` is a single exported string precisely so an absence cannot
    // be phrased more softly on one screen than another.
    expect(NOT_MEASURED).toContain('Not measured');
    expect(TRACKERS.flatMap((t) => t.fields).filter((f) => f.evidence === null).length)
      .toBeGreaterThan(0);
  });
});
