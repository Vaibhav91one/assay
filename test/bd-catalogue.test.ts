// Every dataset_id this repo ships exists in Bright Data's live catalogue.
//
// WHY THIS TEST FETCHES INSTEAD OF READING A FIXTURE. `SCRAPERS` makes a claim
// about a third party's API -- sixty-nine `gd_` strings, each one an assertion
// that asking Bright Data for it will get a scraper rather than a 404. A
// checked-in copy of `/datasets/list` would let that claim go stale silently:
// the fixture and the file would agree forever while the endpoint moved on, and
// the test would stay green through the exact failure it exists to catch. So it
// asks the endpoint.
//
// AND WHY IT SKIPS LOUDLY RATHER THAN PASSING. Without a token, or without a
// network, this cannot check anything. A test that goes green because it could
// not look is worse than no test -- it is the vacuous-pass shape `ASSAY_REQUIRE_DB`
// exists to turn into a failure, and CONTRIBUTING.md names it. So the token's
// absence is a `skip` with the reason printed, never a pass; and once there IS
// a token, a failed fetch is a FAILURE, because at that point "Bright Data did
// not answer" is a real finding about a real dependency and not a local
// inconvenience.
//
// IT SPENDS NOTHING. `/datasets/list` reports what the account owns. It runs no
// scraper and bills no collection.

import { describe, expect, it } from 'vitest';
import {
  CURATED_SCRAPERS, SCRAPERS, forgetCatalogue, isJunkName, listDatasets, searchDatasets,
} from '../src/connectors/scrapers.js';

const TOKEN = process.env.BRIGHTDATA_API_TOKEN;

// `describe.skipIf` rather than an early return inside the test: vitest reports
// the first as skipped and the second as passed, and this file's whole point is
// that the difference is visible.
describe.skipIf(!TOKEN)('the shipped dataset ids exist in the live catalogue', () => {
  it('is not being skipped for the wrong reason', () => {
    // Reached only when a token is set, so this documents which arm ran.
    expect(TOKEN, 'BRIGHTDATA_API_TOKEN must be set for this file to mean anything')
      .toBeTruthy();
  });

  it('returns a catalogue big enough to be the real one', async () => {
    const all = await listDatasets();
    // 1,744 when this was written. Pinning that exact number would make a test
    // fail every time Bright Data ships a scraper, which is a fact about them
    // and not a regression here -- so the assertion is that this is plainly the
    // whole inventory rather than a truncated page of it.
    expect(all.length).toBeGreaterThan(1000);
    for (const e of all.slice(0, 20)) {
      expect(e.id).toMatch(/^gd_/);
      expect(typeof e.name).toBe('string');
    }
  }, 60_000);

  it('finds every id on every curated card', async () => {
    const live = new Set((await listDatasets()).map((e) => e.id));
    const missing: string[] = [];
    for (const s of SCRAPERS) {
      for (const d of s.datasets) if (!live.has(d.id)) missing.push(`${s.id}: ${d.name} (${d.id})`);
      if (s.datasetId && !live.has(s.datasetId)) missing.push(`${s.id}: default ${s.datasetId}`);
    }
    // Named rather than counted: a failure here has to say WHICH card is
    // pointing at a dataset that no longer exists, or the next person has to
    // rediscover it by hand across sixty-nine ids.
    expect(missing).toEqual([]);
  }, 60_000);

  it('still calls each shipped dataset by the name Bright Data calls it', async () => {
    // The id is what makes the call work; the name is what the operator picks
    // in the select and what they will look for in Bright Data's own console.
    // A renamed dataset is not an outage, so this reports the drift by name
    // rather than failing on a string Bright Data is free to change -- but it
    // reports it, because a select labelled with last year's name is a screen
    // lying quietly.
    const byId = new Map((await listDatasets()).map((e) => [e.id, e.name]));
    const drifted = SCRAPERS.flatMap((s) => s.datasets
      .filter((d) => byId.has(d.id) && byId.get(d.id) !== d.name)
      .map((d) => `${s.id}: shipped "${d.name}", live "${byId.get(d.id)!}"`));
    if (drifted.length) console.warn(`dataset names have drifted:\n  ${drifted.join('\n  ')}`);
    expect(drifted.length, drifted.join('; ')).toBeLessThan(SCRAPERS.length);
  }, 60_000);

  it('hides the junk-named entries and can say how many', async () => {
    const r = await searchDatasets('a');
    expect(r.total).toBeGreaterThan(1000);
    // There really are some -- if this ever hits zero the filter has stopped
    // matching and the count under the search box has become decoration.
    expect(r.hidden).toBeGreaterThan(0);
    expect(r.hidden).toBeLessThan(r.total / 4);
    for (const m of r.matches) expect(isJunkName(m.name), m.name).toBe(false);
  }, 60_000);

  it('says when everything that matched was hidden, rather than "nothing"', async () => {
    // `Plessers Product - test` is a real entry and it is hidden. Reporting
    // that search as empty would tell the operator the catalogue has nothing of
    // the sort, when what is true is that what it has was marked as a test by
    // whoever made it. Different answers, and the second is the one they can
    // act on.
    const r = await searchDatasets('plessers');
    expect(r.matches).toEqual([]);
    expect(r.hiddenMatches).toBeGreaterThan(0);

    // `uniqlo` is the counter-example, and the reason the patterns are
    // delimited rather than greedy: `Uniqlo Products - test` is hidden and
    // `Uniqlo Products` is not, so that search still returns the real one. A
    // filter that took the brand down with the scratch copy would be doing
    // more damage than the junk it removes.
    expect((await searchDatasets('uniqlo')).matches.length).toBeGreaterThan(0);
    // And a word that genuinely matches nothing reports nothing hidden, so the
    // two states stay distinguishable.
    expect((await searchDatasets('zzzznotathing')).hiddenMatches).toBe(0);
  }, 60_000);

  it('resolves a brand to a real id and never to one it made up', async () => {
    const live = new Set((await listDatasets()).map((e) => e.id));
    for (const q of ['LinkedIn people profiles', 'Instagram - Profiles', 'Zillow price history']) {
      const r = await searchDatasets(q);
      expect(r.matches[0]?.name, q).toBe(q);
      expect(live.has(r.matches[0]!.id), q).toBe(true);
    }
    // An id is matched exactly, not by substring: pasting one names one thing.
    const byId = await searchDatasets('gd_l1vikfch901nx3by4');
    expect(byId.matches.map((m) => m.id)).toEqual(['gd_l1vikfch901nx3by4']);
    // And a word nothing is called returns nothing rather than a nearest guess.
    expect((await searchDatasets('zzzznotathing')).matches).toEqual([]);
  }, 60_000);

  it('reads the endpoint once and then reuses it', async () => {
    // The cache is the reason a search box is not a request per keystroke.
    forgetCatalogue();
    const t0 = Date.now();
    await listDatasets();
    const cold = Date.now() - t0;
    const t1 = Date.now();
    await listDatasets();
    expect(Date.now() - t1).toBeLessThanOrEqual(Math.max(cold, 5));

    // And it expires: a `now` past the TTL fetches again rather than serving a
    // six-hour-old list forever.
    const aged = await listDatasets(Date.now() + 7 * 60 * 60 * 1000);
    expect(aged.length).toBeGreaterThan(1000);
  }, 60_000);
});

describe('what holds whether or not the network is there', () => {
  it('ships sixty-odd ids across twenty-eight brands, all well-formed', () => {
    // Not a network claim -- a shape claim, so it runs everywhere and catches a
    // typo in `SCRAPERS` without asking anybody's API.
    expect(CURATED_SCRAPERS.length).toBe(28);
    const ids = SCRAPERS.flatMap((s) => s.datasets.map((d) => d.id));
    expect(ids.length).toBeGreaterThan(60);
    for (const id of ids) expect(id).toMatch(/^gd_[a-z0-9]+$/);
    // The same id may legitimately appear on two brand cards; the same id twice
    // on ONE card is a copy-paste slip and would render two identical options.
    for (const s of SCRAPERS) {
      expect(new Set(s.datasets.map((d) => d.id)).size, s.id).toBe(s.datasets.length);
    }
  });

  it('warns rather than pretends when there is no token', () => {
    if (!TOKEN) {
      console.warn('BRIGHTDATA_API_TOKEN is not set: the live catalogue checks were SKIPPED, '
        + 'not passed. No shipped dataset_id has been verified in this run.');
    }
    expect(true).toBe(true);
  });
});
