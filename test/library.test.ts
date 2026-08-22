// The tracker library.
//
// Every assertion catches a failure that would otherwise be silent and land on
// a first-time operator. A tracker whose emitted contract does not parse fails
// at APPROVE time, after somebody has pasted a link and pressed Run. A prior
// that finds Amazon's list price instead of its selling price fails worse: it
// succeeds, and the operator watches a number that never moves.
//
// Pure: no Postgres, no clock, NO NETWORK. The discovery tests run against HTML
// committed under `test/fixtures/library/` rather than the live sites, because
// a test that fetched Amazon would fail on a train, and a red CI meaning
// "someone else's site changed" is a red CI people learn to ignore. The
// fixtures are what those sites actually served on 2026-08-23.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TRACKERS, GROUPS, trackerById, thresholdsOf } from '../src/library/index.js';
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
        // The message names the tracker and the field: a bare "invalid
        // contract" in CI sends someone to read all of them.
        if (!r.ok) throw new Error(`${t.id}.${f.name}: ${formatIssues(r.issues)}`);
        expect(r.contract.target).toBe(targetId);
        expect(r.contract.fields[f.name]!.policy).toBe(f.policy);
      }
    }
  });

  it('names fields the create path will accept', () => {
    // `FieldName` is what `CreateInput` enforces; a bad name is refused by
    // `createTarget` after the operator has already pressed the button.
    for (const t of TRACKERS) {
      for (const f of t.fields) {
        expect(FieldName.safeParse(f.name).success, `${t.id}.${f.name}`).toBe(true);
      }
    }
  });

  it('names a cadence the engine can schedule', async () => {
    // `build` validates against this enum, so a cadence outside it is accepted
    // by this file and refused on submit.
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
        // before it. The worst kind of bug to find in production.
        expect(f.match.flags ?? '', `${t.id}.${f.name} flags`).not.toContain('g');
        for (const p of [f.match.pattern, f.match.avoid, f.match.select]) {
          if (p) expect(() => new RegExp(p, f.match.flags ?? 'i'), `${t.id}.${f.name}`).not.toThrow();
        }
        expect(f.match.maxLen, `${t.id}.${f.name} band`).toBeGreaterThan(f.match.minLen);
      }
    }
  });

  it('is internally consistent: unique ids, unique fields, prose in every slot', () => {
    expect(TRACKERS.length).toBeGreaterThan(0);
    expect(new Set(TRACKERS.map((t) => t.id)).size).toBe(TRACKERS.length);

    const groups = new Set(GROUPS.map((g) => g.id));
    for (const t of TRACKERS) {
      expect(trackerById(t.id)).toBe(t);
      // A tracker in no group renders nowhere: the catalogue draws shelf by
      // shelf, so a typo here silently removes the card from the product.
      expect(groups.has(t.group as never), `${t.id} group "${t.group}"`).toBe(true);
      expect(t.fields.length, `${t.id} has no fields`).toBeGreaterThan(0);
      expect(new Set(t.fields.map((f) => f.name)).size, `${t.id} repeats a field`)
        .toBe(t.fields.length);
      // Every string a screen prints has to exist. An empty one renders as a
      // gap that reads like a bug rather than like a decision.
      for (const [k, v] of Object.entries({
        name: t.name, subheading: t.subheading, placeholder: t.placeholder,
      })) {
        expect(v.trim().length, `${t.id}.${k} is empty`).toBeGreaterThan(0);
      }
      for (const f of t.fields) {
        expect(TIERS).toContain(f.policy);
        expect(f.label.trim().length, `${t.id}.${f.name} label`).toBeGreaterThan(0);
      }
    }
  });

  it('gives the named trackers an identity hint and the generic one none', () => {
    // The whole difference between a site tracker and the generic one. If a
    // named tracker loses its hints it silently becomes the generic tracker
    // wearing a site's name, which is the failure mode worth a test.
    // Narrowed by the element's identity or by its tag -- arXiv anchors on
    // `dt a` and an `h3` rather than a class, which is still a claim about
    // arXiv's markup and not about pages in general.
    for (const t of TRACKERS.filter((x) => x.id !== 'any')) {
      expect(
        t.fields.some((f) => f.match.select || f.match.tags),
        `${t.id} is not narrowed to its site`,
      ).toBe(true);
    }
    for (const f of trackerById('any')!.fields) {
      expect(f.match.select, `any.${f.name} should be generic`).toBeUndefined();
      expect(f.match.tags, `any.${f.name} should be generic`).toBeUndefined();
    }
  });
});

describe('a prior finds the value a person would point at', () => {
  /**
   * The test that matters most, and the only one that needed real pages.
   *
   * A tracker that proposes SOMETHING is not a tracker that works. Each case
   * names the page, the field, and the exact string the operator should end up
   * watching. Several were real failures first: Amazon's M.R.P. beat its
   * selling price, a filter dropdown reading "Under ₹500" beat both, and the
   * generic price prior picked a whole product card on webscraper.io.
   */
  const CASES: { fixture: string; tracker: string; field: string; value: string }[] = [
    // The list price (₹499) and the selling price (₹370.00) are both rupee
    // amounts in near-identical spans. `a-color-price` is the only thing that
    // separates them, and without it document order gives the M.R.P.
    { fixture: 'amazon-product', tracker: 'amazon', field: 'price', value: '₹370.00' },
    { fixture: 'amazon-product', tracker: 'amazon', field: 'product_name', value: 'The Most Dangerous Place: A History of the United States in South Asia' },
    // #availability carries whatever the stock line says, which is the point --
    // the wording is the thing that changes.
    { fixture: 'amazon-unavailable', tracker: 'amazon', field: 'availability', value: 'Currently unavailable. We don\'t know when or if this item will be back in stock.' },
    { fixture: 'gh-releases', tracker: 'github', field: 'latest_release', value: '2026-08-05, Version 26.7.0 (Current), @aduh95' },
    // Caught live on facebook/react: without the `relative-time` tag hint the
    // date prior took the first date-shaped string in document order, which was
    // a different release's title. It agreed with the newest release on this
    // fixture by luck, which is how it was nearly shipped wrong.
    { fixture: 'gh-releases', tracker: 'github', field: 'released_on', value: '05 Aug 16:25' },
    { fixture: 'wikipedia-article', tracker: 'wikipedia', field: 'last_edited', value: 'This page was last edited on 9 August 2026, at 08:53 (UTC).' },
    { fixture: 'pypi-project', tracker: 'pypi', field: 'version', value: 'Django 6.1' },
    { fixture: 'pypi-project', tracker: 'pypi', field: 'released_on', value: 'Aug 5, 2026' },
    // The identifier, not the title: arXiv's title div begins with a "Title:"
    // descriptor span, and watching that value would watch the label too.
    { fixture: 'arxiv-listing', tracker: 'arxiv', field: 'newest_paper', value: 'arXiv:2608.20338' },
    { fixture: 'arxiv-listing', tracker: 'arxiv', field: 'announcement', value: 'Fri, 21 Aug 2026 (showing first 50 of 76 entries )' },
    { fixture: 'mdn-page', tracker: 'mdn', field: 'last_modified', value: 'This page was last modified on Jun 22, 2026 by MDN contributors.' },
    // The generic tracker, with no identity hint, on two ordinary shops.
    { fixture: 'books-product', tracker: 'any', field: 'price', value: '£51.77' },
    { fixture: 'books-product', tracker: 'any', field: 'availability', value: 'In stock (22 available)' },
    // The first element matching the price prior here is the whole product
    // card, "$24.99 Nokia 123 7 day battery". The containment filter in
    // ./analyse.ts is what leaves the span behind.
    { fixture: 'webscraper-product', tracker: 'any', field: 'price', value: '$24.99' },
  ];

  for (const c of CASES) {
    it(`${c.tracker}.${c.field} on ${c.fixture}`, () => {
      const t = trackerById(c.tracker);
      expect(t, `no tracker "${c.tracker}"`).toBeDefined();
      const found = analyse(t!, fixture(c.fixture)).found.find((f) => f.name === c.field);
      expect(found, `${c.field} is not a field of ${c.tracker}`).toBeDefined();
      expect(found!.value).toBe(c.value);
      // And the derived resolver has to be something `createTarget` accepts, or
      // the table is a screen that cannot be approved.
      expect(found!.field).not.toBeNull();
    });
  }

  it('reports a field it cannot find rather than proposing something else', () => {
    // A Wikipedia article has no price on it. The generic tracker has to say
    // so; the alternative is a watch on whatever else matched, which is the
    // failure this product exists to refuse.
    const a = analyse(trackerById('any')!, fixture('wikipedia-article'));
    const price = a.found.find((f) => f.name === 'price')!;
    expect(price.value).toBeNull();
    expect(price.field).toBeNull();
    expect(a.create.map((f) => f.name)).not.toContain('price');
  });

  it('does not find an Amazon price on a page that is not Amazon', () => {
    // The identity hint has to actually gate. If `select` were ignored, the
    // Amazon tracker would happily read books.toscrape.com and the named
    // trackers would all be the generic one.
    const a = analyse(trackerById('amazon')!, fixture('books-product'));
    expect(a.found.find((f) => f.name === 'price')!.value).toBeNull();
    expect(a.create).toEqual([]);
  });

  it('assembles a CreateInput the boundary accepts, from a real page', () => {
    // Not each field in isolation but the body `approve` actually posts.
    const t = trackerById('amazon')!;
    const a = analyse(t, fixture('amazon-product'));
    const r = CreateInput.safeParse({
      url: 'https://www.amazon.in/dp/0143448706', cadence: t.cadence, fields: a.create,
    });
    if (!r.success) throw new Error(r.error.message);
    expect(a.create.length).toBeGreaterThan(0);
  });
});

describe('a tier is the tier the engine will use', () => {
  it('round-trips through parseContract and thresholdsFor', () => {
    // A screen showing a tier beside a tracker whose stored contract resolved
    // to something else would be a lie about the one setting the tracker sets.
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

  it('claims no measurement anywhere, because none of these sites is in the corpus', () => {
    // The benchmark is 153 cases over one field on ikea, mattel and chicco
    // (docs/LIMITATIONS.md 4). None of the sites here is one of them, so there
    // is no `evidence` slot on a field and nothing for a screen to print. If
    // somebody adds one, they have to add the number with it.
    for (const t of TRACKERS) {
      for (const f of t.fields) {
        expect(f, `${t.id}.${f.name}`).not.toHaveProperty('evidence');
      }
    }
  });
});
