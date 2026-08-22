// Replay the full pipeline across the whole corpus to produce an operational
// history: many runs, mostly healthy, some breaks, some abstentions.
//
// This is what the dashboard reads. Each consecutive pair of captures is treated
// as "last known good" -> "this run", which is exactly the situation a scheduled
// scraper is in every morning.
//
// The pipeline itself lives in src/runner.js -- this file is the harness that
// feeds it corpus pages. The worker and the Bright Data webhook feed the same
// function, which is the point: one loop, so the benchmark tests the product.
//
//   node tools/replay.js [--out results/events.jsonl]

import { load } from 'cheerio';
import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { establishBaseline, runTarget, digest } from '../src/runner.js';
import { putCapture } from '../src/store/captures.js';
import { pickTarget } from '../src/target.js';

const outIdx = process.argv.indexOf('--out');
const OUT = outIdx > -1 ? process.argv[outIdx + 1] : 'results/events.jsonl';
const ROWS = OUT.replace(/events\.jsonl$/, 'rows.jsonl');
const SITES = ['mattel', 'ikea', 'chicco'];
const TAU = 0.6;
const DELTA = 0.16;

const sha = (s: string | null | undefined): string => createHash('sha256').update(s || '').digest('hex').slice(0, 16); // proof ids only

const parse = async (site: string, file: string) => {
  const $ = load(await readFile(`corpus/${site}/${file}`, 'utf8'));
  $('script,style,noscript').remove();
  return $;
};

const EXPECTED = { regex: '(recall|rappel|retirada|remedy|alert)', regexFlags: 'i', minLen: 20 };

const run = async () => {
  // TODO(types): these are the proof record and the published row -- see
  // `ProofEvent` in src/runner.ts for why neither is pinned as an interface.
  const events: any[] = [];
  const rows: any[] = [];
  let runNo = 0;
  let stored = 0;
  let deduped = 0;

  for (const site of SITES) {
    const files = (await readdir(`corpus/${site}`)).filter((f) => f.endsWith('.html')).sort();
    if (files.length < 2) continue;

    const $0 = await parse(site, files[0]);
    const el0 = pickTarget($0);
    if (!el0) continue;

    const baseline = establishBaseline({
      $: $0,
      el: el0,
      field: 'recall_title',
      expected: EXPECTED,
      goldenSha: (await putCapture($0.html())).sha,
    });

    const history = [];

    for (let i = 1; i < files.length; i++) {
      const file = files[i];
      runNo++;
      const meta = { run: runNo, site, capture: file.slice(0, 8) };
      const r = await runTarget({
        fetchPage: () => parse(site, file).then(($) => ({ $ })),
        baseline,
        history,
        thresholds: { tau: TAU, delta: DELTA },
        meta,
        proofId: `pr_${sha(`${site}${file}${baseline.field}`)}`,
      });
      history.push(r.sample);
      events.push(r.event);
      rows.push(r.row);
      // Keep the page only when a decision was made about it. A clean run has
      // nothing to show a human, so storing it is retention for its own sake.
      if (r.event.event !== 'ok') {
        const put = await putCapture((await parse(site, file)).html());
        if (put.deduped) deduped++; else stored++;
      }
    }
  }

  await mkdir('results', { recursive: true });
  await writeFile(OUT, events.map((e) => JSON.stringify(e)).join('\n') + '\n');
  await writeFile(ROWS, rows.map((e) => JSON.stringify(e)).join('\n') + '\n');

  const by = (k: string) => events.filter((e) => e.event === k).length;
  console.log(`\nreplayed ${events.length} runs across ${SITES.length} sites`);
  console.log(`  ok       ${by('ok')}`);
  console.log(`  heal     ${by('heal')}`);
  console.log(`  abstain  ${by('abstain')}`);
  const causes: Record<string, number> = {};
  events.filter((e) => e.event !== 'ok').forEach((e) => {
    causes[e.attributed_cause] = (causes[e.attributed_cause] || 0) + 1;
  });
  console.log(`  causes   ${JSON.stringify(causes)}`);
  const held = rows.filter((r) => r._assay.fields.recall_title.status === 'quarantined').length;
  console.log(`  held     ${held} cells published as labelled holes`);
  console.log(`  captures ${stored} stored, ${deduped} deduped`);
  console.log(`-> ${OUT}`);
  console.log(`-> ${ROWS}\n`);
};


run();
