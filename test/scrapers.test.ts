// The Bright Data prebuilt-scraper client, and the catalogue it offers.
//
// NOTHING HERE TOUCHES BRIGHT DATA. Every request is answered by a stub, which
// is the only way the 202-then-snapshot branch and the size bound can be tested
// at all -- neither is reproducible on demand against a live API, and a test
// that spends the operator's credit to prove a request shape is a test nobody
// runs twice.
//
// The catalogue group is not decoration. `SCRAPERS` makes a claim about a third
// party's API -- that `gd_l1vikfch901nx3by4` is Instagram profiles -- and the
// thing that can be checked here is that every claim carries the page it was
// read off and that nothing was invented alongside them.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { load } from 'cheerio';
import { DeliveryError, HTML_KEYS, pageFrom } from '../src/connectors/brightdata.js';
import { ingestPage } from '../src/connectors/ingest.js';
import { keySelector } from '../src/connectors/record.js';
import { STATUSES } from '../src/envelope.js';
import { getDb, sql } from '../src/store/index.js';
import {
  ALL_TRACKERS, CURATED_SCRAPERS, DatasetId, SCRAPERS, ScrapeError, fieldNameFor,
  fieldsFromRecord, findScraper, isJunkName, libraryTrackerById, scrape, scraperById,
} from '../src/connectors/scrapers.js';
import { GROUPS, TRACKERS, thresholdsOf } from '../src/library/index.js';
import { analyse } from '../src/library/analyse.js';
import { contractFor } from '../src/library/contract.js';
import { parseContract } from '../src/contracts/index.js';
import { recordToHtml } from '../src/connectors/record.js';
import { CreateInput, FieldName, targetIdFor } from '../src/setup/index.js';

const IG_DATASET = 'gd_l1vikfch901nx3by4';
const RECORD = {
  user_name: 'instagram',
  full_name: 'Instagram',
  followers: 676000000,
  following: 500,
  posts_count: 7800,
  is_verified: true,
  url: 'https://www.instagram.com/instagram',
};

/** Every request the code under test made, in order. */
interface Seen { url: string; init: RequestInit }

function stub(answers: (seen: Seen) => Response): Seen[] {
  const seen: Seen[] = [];
  vi.stubGlobal('fetch', async (url: string | URL, init: RequestInit = {}) => {
    const s = { url: String(url), init };
    seen.push(s);
    return answers(s);
  });
  return seen;
}

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

beforeEach(() => {
  process.env.BRIGHTDATA_API_TOKEN = 'test-token';
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  delete process.env.BRIGHTDATA_API_TOKEN;
});

describe('the synchronous call', () => {
  it('is a POST to the documented endpoint with the documented body', async () => {
    const seen = stub(() => json([RECORD]));
    const r = await scrape(IG_DATASET, 'https://www.instagram.com/instagram');

    expect(seen).toHaveLength(1);
    expect(seen[0]!.url).toBe(
      `https://api.brightdata.com/datasets/v3/scrape?dataset_id=${IG_DATASET}&format=json`,
    );
    expect(seen[0]!.init.method).toBe('POST');
    // A BARE ARRAY. The api-reference page describes an `{"input": [...]}`
    // wrapper and every quickstart shows this; the header comment in
    // `src/connectors/scrapers.ts` says which one won and why.
    expect(seen[0]!.init.body).toBe('[{"url":"https://www.instagram.com/instagram"}]');
    expect(r).toEqual(RECORD);
  });

  it('carries the token from the variable this repo already uses', async () => {
    const seen = stub(() => json([RECORD]));
    await scrape(IG_DATASET, 'https://www.instagram.com/instagram');
    expect((seen[0]!.init.headers as Record<string, string>).authorization).toBe('Bearer test-token');
  });

  it('takes the first record when the endpoint answers a bare object', async () => {
    stub(() => json(RECORD));
    expect(await scrape(IG_DATASET, 'https://x.test/a')).toEqual(RECORD);
  });
});

describe('the snapshot fallback', () => {
  // The documented behaviour after the 1-minute sync timeout: an HTTP 202 with
  // a snapshot id where the records should be. Treating that body as a record
  // is how a scraper starts publishing `{"snapshot_id": "s_..."}` as a profile.
  const SNAP = 's_m4x7enmven8djfqak';

  /** Drives the poll loop's sleeps without waiting for them. */
  async function withFakeClock<T>(run: () => Promise<T>): Promise<T> {
    vi.useFakeTimers();
    const p = run();
    // Attached before the timers are advanced so a rejection is never
    // unhandled, which vitest reports as a failure in an unrelated test.
    const settled = p.then((v) => ({ v }), (e: unknown) => ({ e }));
    await vi.runAllTimersAsync();
    const r = await settled;
    if ('e' in r) throw r.e;
    return r.v;
  }

  it('polls progress and then downloads, rather than returning the snapshot id', async () => {
    let progressed = 0;
    const seen = stub((s) => {
      if (s.url.includes('/scrape?')) return json({ snapshot_id: SNAP }, 202);
      if (s.url.includes('/progress/')) {
        return json({ snapshot_id: SNAP, status: progressed++ === 0 ? 'running' : 'ready' });
      }
      return json([RECORD]);
    });

    const r = await withFakeClock(() => scrape(IG_DATASET, 'https://www.instagram.com/instagram'));

    expect(r).toEqual(RECORD);
    expect(seen.map((s) => s.url)).toEqual([
      `https://api.brightdata.com/datasets/v3/scrape?dataset_id=${IG_DATASET}&format=json`,
      `https://api.brightdata.com/datasets/v3/progress/${SNAP}`,
      `https://api.brightdata.com/datasets/v3/progress/${SNAP}`,
      `https://api.brightdata.com/datasets/v3/snapshot/${SNAP}?format=json`,
    ]);
    expect(seen[1]!.init.method).toBe('GET');
  });

  it('takes the same branch when the snapshot id arrives with a 200', async () => {
    // Detected by SHAPE, not by status: a `snapshot_id` where a record should
    // be is the same fact whichever code it came with.
    stub((s) => (s.url.includes('/scrape?')
      ? json({ snapshot_id: SNAP })
      : s.url.includes('/progress/') ? json({ status: 'ready' }) : json([RECORD])));

    expect(await withFakeClock(() => scrape(IG_DATASET, 'https://x.test/a'))).toEqual(RECORD);
  });

  it('reports a failed snapshot as failed rather than waiting it out', async () => {
    const seen = stub((s) => (s.url.includes('/scrape?')
      ? json({ snapshot_id: SNAP }, 202)
      : json({ status: 'failed' })));

    const e = await withFakeClock(
      () => scrape(IG_DATASET, 'https://x.test/a').catch((x: unknown) => x as ScrapeError),
    );
    expect(e).toBeInstanceOf(ScrapeError);
    expect((e as ScrapeError).code).toBe('snapshot_failed');
    // One poll, not twenty: a terminal status is terminal.
    expect(seen).toHaveLength(2);
  });

  it('gives up after a bounded number of polls, and says what to do', async () => {
    stub((s) => (s.url.includes('/scrape?')
      ? json({ snapshot_id: SNAP }, 202)
      : json({ status: 'running' })));

    const e = await withFakeClock(
      () => scrape(IG_DATASET, 'https://x.test/a').catch((x: unknown) => x as ScrapeError),
    ) as ScrapeError;
    expect(e).toBeInstanceOf(ScrapeError);
    expect(e.status).toBe(504);
    expect(e.code).toBe('snapshot_timeout');
    expect(e.message).toContain(SNAP);
    expect(e.message).toMatch(/webhook/);
  });
});

describe('the response is bounded', () => {
  it('refuses a declared length over the ceiling before reading a byte', async () => {
    const seen = stub(() => new Response('[]', {
      headers: { 'content-length': String(64 * 1024 * 1024) },
    }));

    await expect(scrape(IG_DATASET, 'https://x.test/a')).rejects.toMatchObject({
      status: 413, code: 'too_large',
    });
    expect(seen).toHaveLength(1);
  });

  it('refuses a body that goes over the ceiling while streaming', async () => {
    // `content-length` is the cheap check and also the obvious lie, so the
    // bytes actually read are counted too. A chunked body declares nothing.
    const chunk = new TextEncoder().encode('x'.repeat(1024 * 1024));
    stub(() => new Response(new ReadableStream({
      start(c) {
        for (let i = 0; i < 9; i++) c.enqueue(chunk);
        c.close();
      },
    })));

    await expect(scrape(IG_DATASET, 'https://x.test/a')).rejects.toMatchObject({
      status: 413, code: 'too_large',
    });
  });

  it('reads a record comfortably under the ceiling', async () => {
    stub(() => json([{ ...RECORD, biography: 'b'.repeat(100_000) }]));
    const r = await scrape(IG_DATASET, 'https://x.test/a');
    expect((r.biography as string).length).toBe(100_000);
  });
});

describe('every failure is a ScrapeError carrying a status', () => {
  const cases: { name: string; answer: () => Response; status: number; code: string }[] = [
    {
      name: 'an upstream 401',
      answer: () => new Response('Unauthorized', { status: 401 }),
      status: 401,
      code: 'upstream',
    },
    {
      name: 'an upstream 400 naming a bad dataset',
      answer: () => new Response('{"error":"dataset not found"}', { status: 400 }),
      status: 400,
      code: 'upstream',
    },
    {
      name: 'a 200 with an empty body',
      answer: () => new Response('', { status: 200 }),
      status: 502,
      code: 'empty',
    },
    {
      name: 'a 200 that is not JSON',
      answer: () => new Response('<html>maintenance</html>', { status: 200 }),
      status: 502,
      code: 'unparseable',
    },
    {
      name: 'an empty array, meaning the scraper found nothing',
      answer: () => json([]),
      status: 502,
      code: 'not_a_record',
    },
    {
      name: 'a record with no fields',
      answer: () => json([{}]),
      status: 422,
      code: 'empty_record',
    },
    {
      name: 'a per-row collection error, which Bright Data returns as a row',
      answer: () => json([{ error: 'page not found', warning: 'dead profile' }]),
      status: 422,
      code: 'row_error',
    },
  ];

  for (const c of cases) {
    it(`reports ${c.name} as ${c.status} ${c.code}`, async () => {
      stub(c.answer);
      const e = await scrape(IG_DATASET, 'https://x.test/a').catch((x: unknown) => x) as ScrapeError;
      expect(e).toBeInstanceOf(ScrapeError);
      expect(e.status).toBe(c.status);
      expect(e.code).toBe(c.code);
    });
  }

  it('reports a transport failure as 502, not as a bad request', async () => {
    stub(() => { throw new Error('ECONNRESET'); });
    await expect(scrape(IG_DATASET, 'https://x.test/a')).rejects.toMatchObject({
      status: 502, code: 'unreachable',
    });
  });

  it('says the token is unset rather than that the endpoint is down', async () => {
    // The distinction `src/connectors/config.ts` exists to keep: a credential
    // nobody set and a service that is failing are different facts, and one of
    // them the operator can fix in a second.
    delete process.env.BRIGHTDATA_API_TOKEN;
    const seen = stub(() => json([RECORD]));
    const e = await scrape(IG_DATASET, 'https://x.test/a').catch((x: unknown) => x) as ScrapeError;
    expect(e.status).toBe(503);
    expect(e.code).toBe('no_token');
    expect(e.message).toContain('BRIGHTDATA_API_TOKEN');
    expect(seen).toHaveLength(0);
  });

  it('never puts the token in a message', async () => {
    process.env.BRIGHTDATA_API_TOKEN = 'sekrit-9f3a';
    stub(() => new Response('nope', { status: 403 }));
    const e = await scrape(IG_DATASET, 'https://x.test/a').catch((x: unknown) => x) as ScrapeError;
    expect(e.message).not.toContain('sekrit-9f3a');
  });

  it('refuses a dataset id before it ever reaches a URL', async () => {
    const seen = stub(() => json([RECORD]));
    for (const bad of ['', '../../etc', 'gd_x?y=1', 'GD_ABC', 'gd_a b', 'l1vikfch901nx3by4']) {
      const e = await scrape(bad, 'https://x.test/a').catch((x: unknown) => x) as ScrapeError;
      expect(e, bad).toBeInstanceOf(ScrapeError);
      expect(e.status, bad).toBe(400);
    }
    expect(seen).toHaveLength(0);
  });
});

describe('the catalogue claims nothing it did not read', () => {
  it('cites a doc page for every entry', () => {
    for (const s of SCRAPERS) {
      expect(s.docUrl, s.id).toMatch(/^https:\/\/docs\.brightdata\.com\//);
    }
  });

  it('keeps the two ids that a doc page confirms, and one open card', () => {
    // These two are the only ids in this file that TWO sources agree on: a
    // fetched quickstart, and `/datasets/list`. The other sixty-seven have one
    // source, which is the endpoint -- good enough to ship, and pinned live by
    // `bd-catalogue.test.ts`, but a different claim and worth telling apart.
    expect(scraperById('bd-instagram')!.datasetId).toBe('gd_l1vikfch901nx3by4');
    expect(scraperById('bd-linkedin')!.datasetId).toBe('gd_l1viktl72bvl7bjuj0');
    expect(SCRAPERS.filter((s) => s.datasetId === null)).toHaveLength(1);
  });

  it('ships ids its own validator accepts, defaults and choices alike', () => {
    for (const s of SCRAPERS) {
      if (s.datasetId) expect(DatasetId.safeParse(s.datasetId).success, s.id).toBe(true);
      for (const d of s.datasets) {
        expect(DatasetId.safeParse(d.id).success, `${s.id}: ${d.id}`).toBe(true);
      }
    }
  });

  it('opens the select on the dataset a bare Run would use', () => {
    // The default is the first choice, not merely one of them. If they drift,
    // the select shows one scraper and the button calls another.
    for (const s of SCRAPERS) {
      if (s.datasetId === null) { expect(s.datasets, s.id).toHaveLength(0); continue; }
      expect(s.datasets[0]?.id, s.id).toBe(s.datasetId);
    }
  });

  it('claims a documented field list for exactly the two documented records', () => {
    // Every other card carries `[]` and takes its fields from the record the
    // operator's own Run returned. A hand-written list for a scraper nobody has
    // run is the fabrication this whole file is arranged to prevent.
    expect(SCRAPERS.filter((s) => s.fields.length).map((s) => s.id).sort())
      .toEqual(['bd-instagram', 'bd-linkedin']);
  });

  it('names fields that can actually become columns', () => {
    for (const s of SCRAPERS) {
      for (const path of s.fields) {
        expect(fieldNameFor(path), `${s.id}: ${path}`).not.toBeNull();
      }
    }
  });

  it('gives the open card no fields, because nothing is known about its record', () => {
    expect(scraperById('dataset')!.fields).toHaveLength(0);
  });
});

describe('the lookup the composer resolves names through', () => {
  it('lists the curated brands and excludes the open card', () => {
    expect(CURATED_SCRAPERS.length).toBe(SCRAPERS.length - 1);
    for (const s of CURATED_SCRAPERS) expect(s.datasetId, s.id).not.toBeNull();
  });

  it('resolves a brand, a site, a card id and a dataset name to the same card', () => {
    for (const q of ['linkedin', 'LinkedIn', 'linkedin.com', 'bd-linkedin']) {
      const m = findScraper(q);
      expect(m?.entry.id, q).toBe('bd-linkedin');
      // A brand name takes the card's default.
      expect(m?.dataset.id, q).toBe('gd_l1viktl72bvl7bjuj0');
    }
    // Naming a dataset fixes the dataset as well as the card.
    const posts = findScraper('LinkedIn posts');
    expect(posts?.entry.id).toBe('bd-linkedin');
    expect(posts?.dataset.name).toBe('LinkedIn posts');
    expect(findScraper('gd_l1vikfch901nx3by4')?.entry.id).toBe('bd-instagram');
    // Punctuation and case are noise; `Best Buy` and `bestbuy` are one word.
    expect(findScraper('best buy')?.entry.id).toBe('bd-bestbuy');
  });

  it('answers null rather than guessing, and never invents an id', () => {
    // A prompt bar that turns a typo into a billable scrape has guessed with
    // the operator's money.
    for (const q of ['', '   ', 'linkden', 'not a brand', 'gd_nosuchdataset']) {
      expect(findScraper(q), q).toBeNull();
    }
    // Everything it CAN return is an id this file ships.
    const shipped = new Set(SCRAPERS.flatMap((s) => s.datasets.map((d) => d.id)));
    for (const s of CURATED_SCRAPERS) {
      expect(shipped.has(findScraper(s.name)!.dataset.id), s.name).toBe(true);
    }
  });
});

describe('the junk filter says what it hid', () => {
  it('excludes the names that mark somebody\'s scratch dataset', () => {
    for (const name of [
      'Test - remove me 7', 'need_to_edit', 'Testing crunchbase ngo crypto',
      'test', 'Test', 'delete please', 'TEST IGNORE', 'Zara - test',
      'LinkedIn jobs information [Delete]', 'TikTok posts [internal use]',
      'tiktok posts - not relevant [delete]', 'keyword_reddit (delete)',
      '[DEPRECATED] Crunchbase companies information - enriched',
      'Google Maps businesses [old version]', '',
    ]) {
      expect(isJunkName(name), name).toBe(true);
    }
  });

  it('keeps a real name that merely contains one of those words', () => {
    // The difference between a filter and a censor. Every pattern is anchored
    // or delimited, so a word inside another word is not a match.
    for (const name of [
      'Amazon products', 'LinkedIn people profiles', 'Fastest delivery products',
      'Contest entries', 'Protest coverage', 'Internally linked pages',
      'Zillow properties listing information', 'Best Buy products',
    ]) {
      expect(isJunkName(name), name).toBe(false);
    }
  });
});

describe('a scraper tracker is a tracker like any other', () => {
  const scraperTrackers = ALL_TRACKERS.filter((t) => t.kind === 'scraper');

  it('joins the seven page trackers rather than replacing them', () => {
    expect(ALL_TRACKERS.filter((t) => t.kind === 'page')).toHaveLength(TRACKERS.length);
    expect(scraperTrackers).toHaveLength(SCRAPERS.length);
    expect(new Set(ALL_TRACKERS.map((t) => t.id)).size).toBe(ALL_TRACKERS.length);
  });

  it('sits on a shelf the catalogue actually draws', () => {
    const shelves = new Set(GROUPS.map((g) => g.id as string));
    for (const t of ALL_TRACKERS) expect(shelves.has(t.group), t.id).toBe(true);
  });

  it('is reachable by id, both kinds through one lookup', () => {
    for (const t of ALL_TRACKERS) expect(libraryTrackerById(t.id)?.id).toBe(t.id);
    expect(libraryTrackerById('nope')).toBeUndefined();
  });

  it('names a cadence the create path accepts', async () => {
    const { CADENCES } = await import('../src/agent/models.js');
    for (const t of scraperTrackers) {
      expect((CADENCES as readonly string[]).includes(t.cadence), t.id).toBe(true);
    }
  });

  it('emits a contract the contract schema accepts, for every field', () => {
    for (const t of scraperTrackers) {
      for (const f of t.fields) {
        expect(FieldName.safeParse(f.name).success, `${t.id}.${f.name}`).toBe(true);
        const targetId = targetIdFor('example', f.name);
        const r = parseContract(contractFor(f, targetId));
        expect(r.ok, `${t.id}.${f.name}`).toBe(true);
        expect(thresholdsOf(f).tau).toBeGreaterThan(0);
      }
    }
  });

  it('never carries a global regex, which `test` would make stateful', () => {
    for (const t of scraperTrackers) {
      for (const f of t.fields) expect(f.match.flags ?? '').not.toContain('g');
    }
  });
});

describe('a tracker reads its own rendered record', () => {
  // THE END OF THE ROUND TRIP: catalogue -> scrape -> render -> analyse. If the
  // priors and the renderer ever disagree about how a key is addressed, this is
  // where it shows, and it is why `scraperField` imports `keyClass` from the
  // renderer rather than repeating the rule.
  it('finds every documented Instagram field on a documented record', () => {
    const t = libraryTrackerById('bd-instagram')!;
    const a = analyse(t, recordToHtml(RECORD));

    for (const f of a.found) {
      expect(f.value, f.name).not.toBeNull();
      // Exactly one candidate: the identity hint is exact here, not a seed.
      expect(f.matches, f.name).toBe(1);
    }
    expect(a.found.find((f) => f.name === 'followers')!.value).toBe('676000000');
    expect(a.found.find((f) => f.name === 'is_verified')!.value).toBe('true');
    expect(a.create).toHaveLength(t.fields.length);
  });

  it('reads a nested key through the flattened path', () => {
    const t = libraryTrackerById('bd-linkedin')!;
    const a = analyse(t, recordToHtml({
      name: 'Satya Nadella',
      city: 'Redmond, Washington',
      country_code: 'US',
      connections: 500,
      followers: 11000000,
      current_company: { name: 'Microsoft', link: 'https://linkedin.com/company/microsoft' },
    }));
    expect(a.found.find((f) => f.name === 'current_company_name')!.value).toBe('Microsoft');
  });

  it('reports a key the vendor stopped sending as not found, and creates nothing for it', () => {
    const t = libraryTrackerById('bd-instagram')!;
    const { followers, ...without } = RECORD;
    const a = analyse(t, recordToHtml(without));

    expect(a.found.find((f) => f.name === 'followers')!.value).toBeNull();
    expect(a.create.map((f) => f.name)).not.toContain('followers');
    // And the others are unharmed -- one missing key does not lose the rest.
    expect(a.create.length).toBe(t.fields.length - 1);
  });

  it('proposes a target the create path would accept', () => {
    const t = libraryTrackerById('bd-instagram')!;
    const a = analyse(t, recordToHtml(RECORD));
    const r = CreateInput.safeParse({
      url: 'https://www.instagram.com/instagram',
      cadence: t.cadence,
      fields: a.create,
    });
    expect(r.success ? null : r.error.issues).toBeNull();
  });
});

describe('the delivery receiver takes a record as well as a page', () => {
  // `pageFrom` used to answer 422 for anything without page bytes, so a
  // prebuilt scraper -- the vendor's headline product -- could not reach the
  // receiver built for that vendor. Both branches are pinned here: the HTML one
  // because it must behave EXACTLY as before, and the record one because it is
  // the hole being closed.
  const PAGE = '<html><body><p>hello</p></body></html>';

  it('takes page bytes under any documented key, unchanged and first', () => {
    for (const k of HTML_KEYS) {
      expect(pageFrom([{ [k]: PAGE }]), k).toBe(PAGE);
    }
  });

  it('prefers page bytes over a record on the SAME row', () => {
    // The precedence is the guarantee that adding a source did not move an
    // existing one: a Studio collector emitting HTML alongside other columns
    // behaves identically to before this branch existed.
    expect(pageFrom([{ html: PAGE, user_name: 'instagram', followers: 1 }])).toBe(PAGE);
  });

  it('prefers page bytes on a LATER row over a record on an earlier one', () => {
    expect(pageFrom([{ user_name: 'instagram' }, { html: PAGE }])).toBe(PAGE);
  });

  it('renders a record when no row carries page bytes', () => {
    const html = pageFrom([RECORD]);
    expect(html).toBe(recordToHtml(RECORD));
    expect(load(html)(keySelector('followers')).text()).toBe('676000000');
  });

  it('skips an empty row rather than ingesting a document with no fields', () => {
    expect(pageFrom([{}, RECORD])).toBe(recordToHtml(RECORD));
  });

  it('still refuses a delivery that is neither, naming both ways in', () => {
    const e = (() => {
      try { pageFrom([{}, []]); return null; } catch (x) { return x as DeliveryError; }
    })();
    expect(e).toBeInstanceOf(DeliveryError);
    expect(e!.status).toBe(422);
    expect(e!.code).toBe('no_page');
    expect(e!.message).toContain('page_html');
    expect(e!.message).toMatch(/structured record/);
  });

  it('does not treat an empty-string html key as page bytes', () => {
    // A collector that emitted the key but no bytes is a broken collector, and
    // an empty page reads downstream as "every field disappeared". The row
    // falls through to the record branch instead -- where `html` is simply one
    // more key, holding the empty string it really holds.
    const html = pageFrom([{ html: '', ...RECORD }]);
    expect(html).not.toBe('');
    expect(load(html)(keySelector('followers')).text()).toBe('676000000');
  });
});

describe('a JSON record goes through ingestPage and out the other side', () => {
  // THE CLAIM THIS WHOLE FEATURE RESTS ON, checked against the real pipeline
  // rather than argued: a record renders, the engine evaluates it, and what
  // comes back is a status from the closed vocabulary -- the same one a fetched
  // page produces, because `ingestPage` cannot tell them apart.
  let dbUp = false;
  const suffix = `p${Date.now().toString(36)}`;
  const slug = `scraper-e2e-${suffix}`;

  /** The target row the receiver would look up, contract and all. */
  const targetFor = (field: string) => ({
    targetId: targetIdFor(slug, field),
    url: 'https://www.instagram.com/instagram',
    contract: {
      field,
      // Exactly what `analyse` -> `resolverFor` derives for this field on this
      // record. Built through the real functions so the test cannot drift from
      // what the approval screen actually writes.
      resolver: analyse(libraryTrackerById('bd-instagram')!, recordToHtml(RECORD))
        .create.find((f) => f.name === field)!.resolver,
    },
  });

  beforeAll(async () => {
    try {
      await getDb().execute(sql`select 1`);
      dbUp = true;
    } catch {
      // `ASSAY_REQUIRE_DB=1` is what turns this vacuous green into a failure.
      // See CONTRIBUTING.md -- vitest reports an early return as passed.
      if (process.env.ASSAY_REQUIRE_DB) throw new Error('ASSAY_REQUIRE_DB=1 but Postgres is unreachable');
    }
  });

  afterAll(async () => {
    if (!dbUp) return;
    // Children first: `targets.target_id` is referenced by six tables and none
    // of the constraints cascades. The run that opened an episode is exactly
    // the run this test exists to produce, so the episode is always there.
    // Leaves first, and not one table cascades. Two of them hang off the RUN
    // rather than off the target, which is why this is an ordered list and not
    // a loop: queue_items -> field_runs -> runs -> targets. A run that opened an
    // episode and queued a decision is exactly the run this test produces.
    const like = `${slug}%`;
    const mine = sql`SELECT run_id FROM runs WHERE target_id LIKE ${like}`;
    await getDb().execute(sql`
      DELETE FROM queue_items WHERE proof_id IN (SELECT proof_id FROM field_runs WHERE run_id IN (${mine}))`);
    await getDb().execute(sql`DELETE FROM field_runs WHERE run_id IN (${mine})`);
    for (const t of ['heal_history', 'runs', 'episodes', 'field_state', 'retractions', 'contracts']) {
      await getDb().execute(sql`DELETE FROM ${sql.identifier(t)} WHERE target_id LIKE ${like}`);
    }
    await getDb().execute(sql`DELETE FROM targets WHERE target_id LIKE ${like}`);
  });

  it('establishes, holds, and reports a closed-vocabulary status throughout', async () => {
    if (!dbUp) return;
    const target = targetFor('followers');
    await getDb().execute(sql`
      INSERT INTO targets (target_id, url, cadence, contract, next_run_at)
      VALUES (${target.targetId}, ${target.url}, 'daily', ${JSON.stringify(target.contract)}::jsonb, now())`);

    // 1. The first record establishes the baseline. Nothing about this call
    //    says the bytes were ever JSON.
    const first = await ingestPage({ target, html: recordToHtml(RECORD), via: 'brightdata' });
    expect(first.skipped).toBe(false);
    expect(STATUSES).toContain(first.result!.status.status);
    expect(first.result!.publishedValue).toBe('676000000');

    // 2. The identical record is skipped, which is the whole reason the render
    //    has to be byte-identical for the same input.
    const same = await ingestPage({ target, html: recordToHtml(RECORD), via: 'brightdata' });
    expect(same.skipped).toBe(true);

    // 3. A CHANGED VALUE is a real reading, not a break: the key is still
    //    there, so the field resolves and publishes the new number.
    const moved = await ingestPage({
      target, html: recordToHtml({ ...RECORD, followers: 676000123 }), via: 'brightdata',
    });
    expect(moved.skipped).toBe(false);
    expect(STATUSES).toContain(moved.result!.status.status);
    expect(moved.result!.publishedValue).toBe('676000123');

    // 4. THE RENAME. `followers` becomes `follower_count`, so the resolver
    //    matches nothing and the engine has to decide on its own. Whatever it
    //    decides, it must be in the closed vocabulary and it must not be a
    //    wrong value silently published -- a heal reads the right number, an
    //    abstention reads nothing at all.
    const { followers, ...rest } = RECORD;
    const renamed = await ingestPage({
      target, html: recordToHtml({ ...rest, follower_count: 676000456 }), via: 'brightdata',
    });
    expect(renamed.skipped).toBe(false);
    const status = renamed.result!.status;
    expect(STATUSES).toContain(status.status);
    if (status.status === 'quarantined') {
      // An abstention publishes a labelled hole and opens an episode, which is
      // what the notifier alerts on. No value is published.
      expect(renamed.result!.publishedValue).toBeNull();
      expect(renamed.episodeId).not.toBeNull();
    } else {
      // A published heal must have read the RIGHT key. This is the assertion
      // the whole product is measured on: a heal that published 500 (the
      // `following` count) rather than 676000456 would be the wrong-value
      // failure, and it would pass a test that only checked the status.
      expect(renamed.result!.publishedValue).toBe('676000456');
    }
  });
});

describe('fields for a record nobody documented', () => {
  it('offers the scalar keys, sorted, and skips the nested ones', () => {
    expect(fieldsFromRecord({
      zebra: 1, alpha: 'a', nested: { deep: 1 }, list: [1, 2],
    })).toEqual(['alpha', 'zebra']);
  });

  it('skips a key that cannot be a column name rather than mangling it', () => {
    // `FieldName` is `/^[a-z][a-z0-9_]{0,30}$/`. A key that does not reduce to
    // one is not offered, because offering it would mean `createTarget`
    // refusing the whole watch at the last step.
    expect(fieldsFromRecord({ '3rd_place': 1, ok_key: 2, '': 3 })).toEqual(['ok_key']);
    expect(fieldNameFor('a'.repeat(40))).toBeNull();
    expect(fieldNameFor('current_company.name')).toBe('current_company_name');
  });

  it('is capped, so a two-hundred-key record is not two hundred checkboxes', () => {
    const wide = Object.fromEntries(
      Array.from({ length: 200 }, (_, i) => [`key_${String(i).padStart(3, '0')}`, i]),
    );
    expect(fieldsFromRecord(wide)).toHaveLength(12);
  });

  it('is deterministic, so the second read proposes what the first did', () => {
    const r = { b: 1, a: 2, c: 3 };
    expect(fieldsFromRecord(r)).toEqual(fieldsFromRecord({ c: 3, a: 2, b: 1 }));
  });
});
