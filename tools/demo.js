// The 30-second demo: same page, two breaks, two different outcomes.
//
//   break it in a way that heals cleanly   -> the healed value is published
//   break it in a way that is a coin flip  -> a labelled hole is published
//
//   npm run demo

import { load } from 'cheerio';
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fingerprint } from '../src/fingerprint.js';
import { healGated } from '../src/heal.js';
import { MUTATIONS, markTarget } from '../src/mutate.js';
import { publishRow } from '../src/envelope.js';

const SITE = 'ikea';
const TAU = 0.6;
const DELTA = 0.16;
const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
const sha = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16);

// ponytail: fourth copy of this finder (run.js, heal-demo.js, selftest.js have
// their own) -- extract to src/ if a fifth appears
function pickTarget($) {
  let best = null;
  $('h2,h3,a,li').each((i, el) => {
    if (best) return;
    const t = clean($(el).text());
    if (t.length < 20 || t.length > 140) return;
    if (!/recall|rappel|retirada|remedy kit/i.test(t)) return;
    if (/recalls\.gov|learn more|click here|^product recalls$/i.test(t)) return;
    best = el;
  });
  return best;
}

const page = async () => {
  const files = (await readdir(`corpus/${SITE}`)).filter((f) => f.endsWith('.html')).sort();
  const file = files.at(-1);
  const html = await readFile(`corpus/${SITE}/${file}`, 'utf8');
  const $ = load(html);
  $('script,style,noscript').remove();
  return { $, file };
};

function breakAndDecide(mutationId, target) {
  return page().then(({ $, file }) => {
    const el = pickTarget($);
    markTarget($, el);
    const m = MUTATIONS.find((x) => x.id === mutationId);
    m.apply($, el);
    const g = healGated($, target, { tau: TAU, delta: DELTA, limit: 5 });
    const run = file.slice(0, 8);
    const row = publishRow({
      values: { recall_title: g.decision === 'heal' ? clean(g.fingerprint.text) : null },
      statuses: {
        recall_title: g.decision === 'heal'
          ? { status: 'healed' }
          : { status: 'quarantined', reason: g.reason, held_since_run: run },
      },
      run,
      proof: `pr_${sha(`${file}${mutationId}${g.decision}`)}`,
    });
    return { m, g, row };
  });
}

const run = async () => {
  const { $, file } = await page();
  const el = pickTarget($);
  const target = fingerprint($, el);

  console.log(`\nassay demo -- ${SITE}, capture ${file.slice(0, 8)}`);
  console.log(`watching: recall_title = "${clean(target.text).slice(0, 60)}"\n`);

  for (const id of ['rename_class', 'duplicate_similar']) {
    const { m, g, row } = await breakAndDecide(id, target);
    console.log(`--- break the page: ${m.label} ---`);
    console.log(`gate: score ${g.score?.toFixed(2)}  margin ${g.margin?.toFixed(2) ?? '-'}  (needs > ${TAU} and > ${DELTA})`);
    console.log(`decision: ${g.decision.toUpperCase()} (${g.reason})\n`);
    console.log(JSON.stringify(row, null, 2) + '\n');
  }

  console.log('Same scraper, same page, two breaks. One healed with a clear winner;');
  console.log('one was a coin flip, so the row shipped a labelled hole instead of a guess.\n');
};

run();
