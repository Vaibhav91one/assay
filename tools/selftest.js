// Runnable check for src/fingerprint.js, asserted against the real corpus.
// node tools/selftest.js   ->   exits non-zero on any failure.

import { load } from 'cheerio';
import { readFile, readdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
import {
  fingerprint,
  fingerprintSelector,
  skeletonHash,
  candidates,
  isVolatileClass,
  isVolatileId,
} from '../src/fingerprint.js';
import { ned, jaccard, sharedWords, score } from '../src/heal.js';
import { healGated } from '../src/heal.js';
import { MUTATIONS, markTarget } from '../src/mutate.js';
import { publishRow, STATUSES } from '../src/envelope.js';

const capturesOf = async (site) =>
  (await readdir(`corpus/${site}`)).filter((f) => f.endsWith('.html')).sort();

const parse = async (site, file) => {
  const $ = load(await readFile(`corpus/${site}/${file}`, 'utf8'));
  $('script,style,noscript').remove();
  return $;
};

/** Pick a real recall-item element the way a human would at capture time. */
function findRecallItem($) {
  let best = null;
  $('a,h2,h3,li,p').each((i, el) => {
    if (best) return;
    const t = $(el).text().replace(/\s+/g, ' ').trim();
    if (t.length < 25 || t.length > 160) return;
    if (!/recall|rappel|retirada|remedy kit|safety alert/i.test(t)) return;
    if (/recalls\.gov|click here|learn more/i.test(t)) return;
    best = el;
  });
  return best;
}

let failures = 0;
const check = (name, fn) => {
  try {
    fn();
    console.log(`  ok   ${name}`);
  } catch (err) {
    failures++;
    console.log(`  FAIL ${name}\n       ${err.message}`);
  }
};

const run = async () => {
  console.log('assay selftest\n');

  // ---- 1. the extractor produces a usable fingerprint on every real site ----
  console.log('fingerprint over real captures');
  const fps = {};
  for (const site of ['mattel', 'ikea', 'chicco']) {
    const files = await capturesOf(site);
    const $ = await parse(site, files.at(-1));
    const el = findRecallItem($);
    check(`${site}: found a recall item to fingerprint`, () => assert.ok(el, 'no element matched'));
    if (!el) continue;
    const fp = fingerprint($, el);
    fps[site] = fp;
    check(`${site}: fingerprint has tag, text and an xpath`, () => {
      assert.ok(fp.tag, 'no tag');
      assert.ok(fp.text && fp.text.length > 10, 'no usable text');
      assert.match(fp.abs_xpath, /^\/html/, 'xpath not rooted at html');
      assert.ok(fp.depth > 0, 'depth not computed');
    });
    check(`${site}: fingerprint is JSON round-trippable`, () =>
      assert.deepEqual(JSON.parse(JSON.stringify(fp)), fp)
    );
  }

  // ---- 2. skeleton hash: stable on content change, moves on template change ----
  console.log('\nskeleton hash');
  const ikeaFiles = await capturesOf('ikea');
  const $a = await parse('ikea', ikeaFiles.at(-1));

  check('deterministic: same page hashes the same twice', () =>
    assert.equal(skeletonHash($a).hash, skeletonHash($a).hash)
  );

  // rewrite every text node; structure untouched. hash MUST NOT move.
  const $textChanged = load(await readFile(`corpus/ikea/${ikeaFiles.at(-1)}`, 'utf8'));
  $textChanged('script,style,noscript').remove();
  $textChanged('*')
    .contents()
    .each((i, n) => {
      if (n.type === 'text' && n.data.trim()) n.data = 'LOREM IPSUM DIFFERENT CONTENT';
    });
  check('content changed, template identical -> hash UNCHANGED', () =>
    assert.equal(skeletonHash($textChanged).hash, skeletonHash($a).hash)
  );

  // insert one wrapper div. structure moved. hash MUST move.
  const $wrapped = load(await readFile(`corpus/ikea/${ikeaFiles.at(-1)}`, 'utf8'));
  $wrapped('script,style,noscript').remove();
  $wrapped('body').children().first().wrap('<div class="assay-injected-wrapper"></div>');
  check('one wrapper div inserted -> hash CHANGED', () =>
    assert.notEqual(skeletonHash($wrapped).hash, skeletonHash($a).hash)
  );

  // real redesign in the corpus: IKEA grew 252KB -> 1000KB during 2026
  const early = ikeaFiles.find((f) => f.startsWith('202601'));
  const late = ikeaFiles.find((f) => f.startsWith('202607')) || ikeaFiles.at(-1);
  if (early && late) {
    const hEarly = skeletonHash(await parse('ikea', early));
    const hLate = skeletonHash(await parse('ikea', late));
    check(`real redesign ${early.slice(0, 6)} vs ${late.slice(0, 6)} -> hash CHANGED`, () =>
      assert.notEqual(hEarly.hash, hLate.hash)
    );
    console.log(`       ${early.slice(0, 6)}: ${hEarly.hash} (${hEarly.nodes} nodes)`);
    console.log(`       ${late.slice(0, 6)}: ${hLate.hash} (${hLate.nodes} nodes)`);
  }

  // ---- 3. candidate set is sane -- this is what the scorer will walk ----
  console.log('\ncandidate set');
  for (const site of ['mattel', 'ikea', 'chicco']) {
    const files = await capturesOf(site);
    const $ = await parse(site, files.at(-1));
    const c = candidates($);
    check(`${site}: ${c.length} candidates, no script/style`, () => {
      assert.ok(c.length > 50, `only ${c.length} candidates`);
      assert.ok(!c.some((e) => ['script', 'style', 'noscript'].includes(e.name)));
    });
  }

  // ---- 4. selector-based capture, the production path ----
  console.log('\nselector capture');
  const $ikea = await parse('ikea', ikeaFiles.at(-1));
  check('fingerprintSelector returns null for a miss (does not throw)', () =>
    assert.equal(fingerprintSelector($ikea, '.definitely-not-present-xyz'), null)
  );
  check('fingerprintSelector round-trips a real selector', () => {
    const fp = fingerprintSelector($ikea, 'h1');
    assert.ok(fp && fp.selector === 'h1' && fp.tag === 'h1');
  });

  // ---- 5. volatility flags: caught on the real corpus, not invented ----
  console.log('\nvolatile identifier detection');
  check('IKEA css-module classes flagged, semantic ones kept', () => {
    assert.ok(isVolatileClass('s1gshh7t'), 's1gshh7t should be volatile');
    assert.ok(isVolatileClass('x1m1sl8e'), 'x1m1sl8e should be volatile');
    assert.ok(isVolatileClass('b1w6l0al'), 'b1w6l0al should be volatile');
    assert.ok(!isVolatileClass('pub__text'), 'pub__text is semantic');
    assert.ok(!isVolatileClass('pub__typography-heading-l'), 'hyphenated is semantic');
    assert.ok(!isVolatileClass('breadcrumb-item'), 'breadcrumb-item is semantic');
    assert.ok(!isVolatileClass('withIntroCopy'), 'withIntroCopy is semantic');
    // CSS-module shape, found in Bright Data's own generated selector for this
    // project's target page: h1._title_185nw_73
    assert.ok(isVolatileClass('_title_185nw_73'), '_title_185nw_73 is a css-module hash');
    assert.ok(isVolatileClass('styles_wrapper_a3f9x'), 'css-module wrapper hash');
    assert.ok(!isVolatileClass('v2-shell'), 'v2-shell is semantic (short segment)');
    assert.ok(!isVolatileClass('col-md-6'), 'bootstrap grid is semantic');
    assert.ok(!isVolatileClass('h1'), 'too short to judge');
  });
  check('CMS GUID ids flagged, human ids kept', () => {
    assert.ok(isVolatileId('706aed10-9b2e-11ed-9e0d-8da3fcabeed7'));
    assert.ok(!isVolatileId('main-content'));
    assert.ok(!isVolatileId('recall-list'));
  });

  // measure it rather than assume it
  for (const site of ['mattel', 'ikea', 'chicco']) {
    const files = await capturesOf(site);
    const $ = await parse(site, files.at(-1));
    let total = 0;
    let dropped = 0;
    for (const el of candidates($)) {
      const fp = fingerprint($, el);
      if (!fp.classes) continue;
      total += fp.classes.length;
      dropped += fp.classes_dropped;
    }
    const pct = total ? ((dropped / total) * 100).toFixed(1) : '0.0';
    console.log(`       ${site}: ${dropped}/${total} class tokens volatile (${pct}%)`);
  }

  // ---- 6. scoring maths ----
  console.log('\nscorer');
  check('ned: identical=1, disjoint~0, partial in between', () => {
    assert.equal(ned('price', 'price'), 1);
    assert.ok(ned('price', 'zzzzz') < 0.25);
    const p = ned('Add to cart', 'Add to basket');
    assert.ok(p > 0.5 && p < 0.9, `got ${p}`);
  });
  check('jaccard on class lists', () => {
    assert.equal(jaccard(['a', 'b'], ['a', 'b']), 1);
    assert.equal(jaccard(['a'], ['b']), 0);
    assert.equal(jaccard(['a', 'b'], ['b', 'c']), 1 / 3);
  });
  check('sharedWords is directional (fraction of ORIGINAL that survives)', () => {
    assert.equal(sharedWords('red bike', 'red bike now'), 1); // all original words survive
    assert.equal(sharedWords('red bike now', 'red bike'), 2 / 3);
  });

  check('ABSENT-ON-BOTH does not inflate featureless elements', () => {
    // two bare divs: no id, no classes, no text, no attributes.
    const bare = { tag: 'div', text: null, classes_stable: null, id: null, href: null,
      alt: null, name: null, type: null, aria_label: null, neighbor_text: null,
      id_xpath: null, abs_xpath: '/html[1]/body[1]/div[1]' };
    const other = { ...bare, abs_xpath: '/html[1]/body[1]/div[9]' };
    const r = score(bare, other);
    // only tag + abs_xpath carry any signal, so only their weight may be counted
    assert.ok(r.weighed <= 1.5 + 0.3 + 1e-9, `weighed ${r.weighed}, absent props were scored`);
    assert.ok(!('classes' in r.parts), 'classes scored despite being absent on both');
    assert.ok(!('href' in r.parts), 'href scored despite being absent on both');
  });

  check('a real element outscores a featureless one against a rich target', () => {
    const target = { tag: 'h2', text: 'IKEA recalls ODGER swivel chair', classes_stable: ['title'],
      id: null, href: null, alt: null, name: null, type: null, aria_label: null,
      neighbor_text: 'Read more', id_xpath: null, abs_xpath: '/html[1]/body[1]/h2[1]' };
    const good = { ...target, abs_xpath: '/html[1]/body[1]/div[1]/h2[1]' };
    const bare = { tag: 'div', text: null, classes_stable: null, id: null, href: null,
      alt: null, name: null, type: null, aria_label: null, neighbor_text: null,
      id_xpath: null, abs_xpath: '/html[1]/body[1]/div[9]' };
    assert.ok(score(target, good).score > score(target, bare).score,
      'featureless element scored at or above the real match');
  });

  check('volatile id is not scored', () => {
    const a = { tag: 'div', id: '706aed10-9b2e-11ed-9e0d-8da3fcabeed7', id_volatile: true,
      text: 'x', classes_stable: null, href: null, alt: null, name: null, type: null,
      aria_label: null, neighbor_text: null, id_xpath: null, abs_xpath: '/html[1]' };
    const b = { ...a, id: 'ffffffff-0000-0000-0000-000000000000' };
    assert.ok(!('id' in score(a, b).parts), 'volatile id was scored');
  });

  // ---- trust envelope: a hole is null AND labelled, and never filled ----
  console.log('\ntrust envelope over a real capture');
  {
    const files = await capturesOf('ikea');
    const mkPage = async () => parse('ikea', files.at(-1));
    const $base = await mkPage();
    const el = findRecallItem($base);
    const target = fingerprint($base, el);
    const gateOn = async (mutationId) => {
      const $ = await mkPage();
      const e = findRecallItem($);
      markTarget($, e);
      MUTATIONS.find((m) => m.id === mutationId).apply($, e);
      return healGated($, target, { tau: 0.6, delta: 0.16, limit: 5 });
    };
    const abstainReasons = ['no_candidates', 'below_tau', 'thin_margin'];

    const gHeal = await gateOn('rename_class');
    const gHold = await gateOn('remove_field');

    check('a healthy value publishes live, non-null', () => {
      const row = publishRow({
        values: { recall_title: target.text },
        statuses: { recall_title: { status: 'live' } },
        run: 'r', proof: 'pr_x',
      });
      assert.equal(row._assay.fields.recall_title.status, 'live');
      assert.ok(row.recall_title, 'live field came out null');
    });

    check('a clean heal publishes healed, non-null', () => {
      assert.equal(gHeal.decision, 'heal', `expected heal, got ${gHeal.decision}`);
      const row = publishRow({
        values: { recall_title: gHeal.fingerprint.text },
        statuses: { recall_title: { status: 'healed' } },
        run: 'r', proof: 'pr_x',
      });
      assert.equal(row._assay.fields.recall_title.status, 'healed');
      assert.ok(row.recall_title, 'healed field came out null');
    });

    check('an abstain publishes a labelled hole with an engine reason', () => {
      assert.equal(gHold.decision, 'abstain', `expected abstain, got ${gHold.decision}`);
      assert.ok(abstainReasons.includes(gHold.reason), `reason ${gHold.reason} not in vocabulary`);
      const row = publishRow({
        values: { recall_title: 'anything the caller tries to sneak in' },
        statuses: { recall_title: { status: 'quarantined', reason: gHold.reason, held_since_run: 'r' } },
        run: 'r', proof: 'pr_x',
      });
      assert.ok('recall_title' in row, 'held field was omitted');
      assert.equal(row.recall_title, null, 'held field was filled');
      assert.equal(row._assay.fields.recall_title.reason, gHold.reason);
    });

    check('the status vocabulary is closed', () => {
      assert.deepEqual(STATUSES, ['live', 'healed', 'quarantined', 'stale', 'degraded']);
      assert.throws(() => publishRow({
        values: {}, statuses: { x: { status: 'confident' } }, run: 'r', proof: 'p',
      }));
    });
  }

  console.log(
    `\n${failures ? `${failures} FAILURE(S)` : 'all checks pass'}\n`
  );
  if (Object.keys(fps).length) {
    console.log('sample fingerprint (ikea):');
    console.log(JSON.stringify(fps.ikea, null, 2));
  }
  process.exit(failures ? 1 : 0);
};

run();
