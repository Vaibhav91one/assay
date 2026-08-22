// The consensus rule, and the one bug that would make it a liability.
//
// A strategy that THROWS must not be read as agreement. That is the dangerous
// failure here and it is dangerous precisely because it is invisible: an
// exception swallowed into "no objection" manufactures unanimity out of a broken
// reader, on the runs most likely to have broken it, and the cell publishes with
// a confidence nothing earned. Everything else in this file is arithmetic; that
// case is the reason the file exists.
//
// The rule is exercised with hand-built strategies rather than the real four, so
// each split is exact rather than whatever the corpus happens to produce. The
// real panel is exercised separately at the bottom, against a real capture.

import { describe as suite, it, expect } from 'vitest';
import { load, type CheerioAPI } from 'cheerio';
import { readFile, readdir } from 'node:fs/promises';

import {
  consensus, consensusVerdict, calibrate, byAbsXPath, STRATEGIES,
  type Strategy, type ReadContext,
} from '../src/consensus/index.js';
import { fingerprint } from '../src/fingerprint.js';
import { pickTarget, RECALL_TITLE } from '../src/target.js';
import { selectorFor } from '../src/runner.js';
import { STATUSES } from '../src/envelope.js';

const PAGE = load(`<html><body>
  <h1>Product recalls</h1>
  <div id="wrap">
    <h2 class="item">Chair recalled due to fall hazard reported by customers</h2>
    <p class="other">Something else entirely</p>
  </div>
</body></html>`);

/** A strategy that always returns the element matching `sel`. */
const at = (id: string, sel: string): Strategy => ({
  id, independence: 'test fixture',
  read: ($) => $(sel).first().get(0) ?? null,
});

const silent = (id: string): Strategy => ({ id, independence: 'test fixture', read: () => null });

const explodes = (id: string): Strategy => ({
  id, independence: 'test fixture',
  read: () => { throw new Error('selector engine blew up'); },
});

const ctx: ReadContext = { target: fingerprint(PAGE, PAGE('h2.item').get(0)), selector: 'h2.item' };

const run = (strategies: Strategy[], quorum = 2) => consensus(PAGE, ctx, { strategies, quorum });

suite('the consensus rule', () => {
  it('publishes when every reading agrees', () => {
    const r = run([at('a', 'h2.item'), at('b', '#wrap h2'), at('c', '.item')]);
    expect(r.decision).toBe('publish');
    expect(r.agreed).toBe(3);
    expect(r.distinct).toBe(1);
    expect(r.value).toContain('Chair recalled');
    expect(r.reason).toMatch(/^unanimous:3/);
  });

  it('holds the cell when one reading of three dissents', () => {
    const r = run([at('a', 'h2.item'), at('b', '.item'), at('c', 'p.other')]);
    expect(r.decision).toBe('abstain');
    expect(r.distinct).toBe(2);
    expect(r.reason).toMatch(/^consensus_split:3 readings, 2 values/);
    // A majority rule would publish here on 2 of 3. The held value must not
    // leak out of the result object even though a majority exists.
    expect(r.value).toBeNull();
    expect(r.element).toBeNull();
  });

  it('holds the cell when nothing agrees with anything', () => {
    const r = run([at('a', 'h1'), at('b', 'h2.item'), at('c', 'p.other')]);
    expect(r.decision).toBe('abstain');
    expect(r.distinct).toBe(3);
  });

  it('does not read a thrown exception as agreement', () => {
    // Two readings agree, a third explodes. If the exception were swallowed into
    // assent this publishes with `agreed: 3`; it must publish with 2 and say why.
    const r = run([at('a', 'h2.item'), at('b', '.item'), explodes('c')]);
    expect(r.decision).toBe('publish');
    expect(r.agreed).toBe(2);
    expect(r.voted).toBe(2);
    const bad = r.votes.find((v) => v.strategy === 'c')!;
    expect(bad.value).toBeNull();
    expect(bad.element).toBeNull();
    expect(bad.error).toMatch(/blew up/);
  });

  it('a thrown exception counts against the quorum, so it can hold the cell', () => {
    const r = run([at('a', 'h2.item'), explodes('b'), explodes('c')]);
    expect(r.decision).toBe('abstain');
    expect(r.reason).toMatch(/^no_corroboration:1 of 2/);
    expect(r.votes.filter((v) => v.error).length).toBe(2);
  });

  it('one lone reading is not unanimity', () => {
    const r = run([at('a', 'h2.item'), silent('b'), silent('c')]);
    expect(r.decision).toBe('abstain');
    expect(r.reason).toMatch(/^no_corroboration/);
    expect(r.value).toBeNull();
  });

  it('no reading at all is its own reason', () => {
    const r = run([silent('a'), silent('b')]);
    expect(r.decision).toBe('abstain');
    expect(r.reason).toBe('no_candidates');
    expect(r.voted).toBe(0);
  });

  it('agrees on the value, not the node -- a parent carrying one string is not a split', () => {
    // #wrap contains the h2 plus a sibling, so it is a genuine split; a wrapper
    // holding ONLY the field is not. Both directions asserted, because getting
    // this backwards is how the benign-tie rule was got wrong once already.
    const $ = load('<body><div id="only"><h2 class="i">Chair recalled due to a hazard</h2></div></body>');
    const c = { target: fingerprint($, $('h2').get(0)), selector: 'h2' };
    expect(consensus($, c, { strategies: [at('a', 'h2'), at('b', '#only')] }).decision).toBe('publish');
    expect(run([at('a', 'h2.item'), at('b', '#wrap')]).decision).toBe('abstain');
  });

  it('compares full text, not the fingerprint 200-char prefix', () => {
    const common = 'x'.repeat(210);
    const $ = load(`<body><h2 id="a">${common} keep using it</h2><h2 id="b">${common} stop using it</h2></body>`);
    const c = { target: fingerprint($, $('#a').get(0)), selector: '#a' };
    expect(consensus($, c, { strategies: [at('a', '#a'), at('b', '#b')] }).decision).toBe('abstain');
  });
});

suite('the capture-time self-check', () => {
  it('keeps only the readings that reproduce the baseline value', () => {
    const keep = calibrate(PAGE, PAGE('h2.item').get(0), ctx, {
      strategies: [at('good', '.item'), at('bad', 'p.other'), explodes('broken'), silent('mute')],
    });
    expect(keep).toEqual(['good']);
  });

  it('a reading dropped at capture cannot veto a later run', () => {
    const strategies = [at('good', 'h2.item'), at('also', '.item'), at('bad', 'p.other')];
    expect(run(strategies).decision).toBe('abstain');
    const calibrated = calibrate(PAGE, PAGE('h2.item').get(0), ctx, { strategies });
    expect(calibrated).toEqual(['good', 'also']);
    expect(consensus(PAGE, { ...ctx, calibrated }, { strategies }).decision).toBe('publish');
  });
});

suite('the status vocabulary', () => {
  const of = (strategies: Strategy[], was?: string | null) =>
    consensusVerdict(PAGE, { ...ctx, was }, { strategies }).verdict;

  it('unanimous and unchanged is live, unanimous and moved is healed', () => {
    const agreed = [at('a', 'h2.item'), at('b', '.item')];
    expect(of(agreed, PAGE('h2.item').text()).status).toBe('live');
    expect(of(agreed, 'something the page used to say').status).toBe('healed');
  });

  it('any split is quarantined, and carries the reason', () => {
    const v = of([at('a', 'h2.item'), at('b', 'p.other')]);
    expect(v.status).toBe('quarantined');
    expect(v.reason).toMatch(/consensus_split/);
  });

  it('never emits a status outside the closed vocabulary', () => {
    for (const s of [[at('a', 'h2.item'), at('b', '.item')], [at('a', 'h2.item'), at('b', 'p.other')],
      [silent('a')], [explodes('a'), explodes('b')]]) {
      expect(STATUSES).toContain(of(s).status);
    }
  });
});

suite('byAbsXPath', () => {
  it('walks to the node the path names', () => {
    const el = PAGE('h2.item').get(0);
    expect(byAbsXPath(PAGE, fingerprint(PAGE, el).abs_xpath)).toBe(el);
  });

  it('returns null rather than a wrong node when the path no longer lands', () => {
    expect(byAbsXPath(PAGE, '/html[1]/body[1]/div[9]/h2[1]')).toBeNull();
    expect(byAbsXPath(PAGE, '/html[1]/body[1]/section[1]')).toBeNull();
    expect(byAbsXPath(PAGE, 'not a path')).toBeNull();
    expect(byAbsXPath(PAGE, null)).toBeNull();
  });
});

suite('the real panel, on a real capture', () => {
  let $: CheerioAPI;
  let el: any;

  const capture = async () => {
    const site = 'ikea';
    const file = (await readdir(`corpus/${site}`)).filter((f) => f.endsWith('.html')).sort()[0]!;
    const page = load(await readFile(`corpus/${site}/${file}`, 'utf8'));
    page('script,style,noscript').remove();
    return page;
  };

  it('every calibrated reading agrees on the page that has not changed', async () => {
    $ = await capture();
    el = pickTarget($);
    expect(el).toBeTruthy();
    const c: ReadContext = { target: fingerprint($, el), selector: selectorFor(el), contract: RECALL_TITLE };
    c.calibrated = calibrate($, el, c);
    // The self-check is what makes this true; without it the panel is only as
    // good as its worst member. At least two must survive or there is no quorum.
    expect(c.calibrated.length).toBeGreaterThanOrEqual(2);
    const r = consensus($, c);
    expect(r.decision).toBe('publish');
    expect(r.value).toBe($(el).text().replace(/\s+/g, ' ').trim());
  });

  it('holds the cell when the field is deleted outright', async () => {
    $ = await capture();
    el = pickTarget($);
    const c: ReadContext = { target: fingerprint($, el), selector: selectorFor(el), contract: RECALL_TITLE };
    c.calibrated = calibrate($, el, c);
    $(el).remove();
    const r = consensus($, c);
    expect(r.decision).toBe('abstain');
  });

  it('no shipped strategy throws on a real page', async () => {
    $ = await capture();
    el = pickTarget($);
    const c: ReadContext = { target: fingerprint($, el), selector: selectorFor(el), contract: RECALL_TITLE };
    const r = consensus($, c, { strategies: STRATEGIES });
    expect(r.votes.filter((v) => v.error)).toEqual([]);
  });
});
