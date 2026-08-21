// Run a target through the pipeline and persist every run to Postgres.
//
// This is the worker's inner loop without the scheduler -- the same runner the
// replay harness and a Bright Data webhook use, writing to the store instead of
// to a jsonl file. It exists to prove the path end to end before D3 wraps a
// clock around it.
//
//   node tools/ingest.js [site] [--mutate <id>]
//
// The real corpus produces zero abstentions -- two and a half years of genuine
// drift never once produced a near-tie, which is the finding in README. So to
// exercise the quarantine path you have to manufacture one, exactly as the
// benchmark does: --mutate duplicate_similar plants a near-identical decoy
// beside the real value on the final capture.

import { load } from 'cheerio';
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { establishBaseline, runTarget } from '../src/runner.js';
import { pickTarget, RECALL_TITLE } from '../src/target.js';
import { MUTATIONS, markTarget } from '../src/mutate.js';
import { putCapture } from '../src/store/captures.js';
import { getDb, closeDb, recordRun, rowByProof, heldCells, targets } from '../src/store/index.js';

const [, , SITE = 'ikea', ...rest] = process.argv;
const mIdx = rest.indexOf('--mutate');
const MUTATE = mIdx > -1 ? rest[mIdx + 1] : null;

const TAU = 0.6;
const DELTA = 0.16;
const EXPECTED = { regex: '(recall|rappel|retirada|remedy|alert)', regexFlags: 'i', minLen: 20 };
const sha16 = (s) => createHash('sha256').update(s || '').digest('hex').slice(0, 16);

const parse = async (file) => {
  const $ = load(await readFile(`corpus/${SITE}/${file}`, 'utf8'));
  $('script,style,noscript').remove();
  return $;
};

const main = async () => {
  const db = getDb();
  const files = (await readdir(`corpus/${SITE}`)).filter((f) => f.endsWith('.html')).sort();
  if (files.length < 2) throw new Error(`corpus/${SITE} needs at least two captures`);

  await db.insert(targets).values({
    targetId: SITE,
    url: `corpus://${SITE}`,
    cadence: '6h',
    contract: { field: 'recall_title', resolver: RECALL_TITLE, expected: EXPECTED,
                thresholds: { tau: TAU, delta: DELTA } },
  }).onConflictDoNothing();

  const $0 = await parse(files[0]);
  const el0 = pickTarget($0);
  if (!el0) throw new Error('no target element in the baseline capture');
  const golden = await putCapture($0.html());
  const baseline = establishBaseline({
    $: $0, el: el0, field: 'recall_title', expected: EXPECTED, goldenSha: golden.sha,
  });
  console.log(`baseline  ${SITE}/${files[0]}  golden ${golden.sha.slice(0, 12)}…`);
  console.log(`          "${baseline.value.slice(0, 64)}"`);

  const history = [];
  let held = null;

  for (let i = 1; i < files.length; i++) {
    const file = files[i];
    const last = i === files.length - 1;

    const fetchPage = async () => {
      const $ = await parse(file);
      if (last && MUTATE) {
        const m = MUTATIONS.find((x) => x.id === MUTATE);
        if (!m) throw new Error(`unknown mutation "${MUTATE}"`);
        const el = pickTarget($);
        if (el) { markTarget($, el); m.apply($, el); }
      }
      return { $ };
    };

    const proofId = `pr_${sha16(`${SITE}${file}${baseline.field}${MUTATE || ''}`)}`;
    const r = await runTarget({
      fetchPage, baseline, history,
      thresholds: { tau: TAU, delta: DELTA },
      meta: { run: i, site: SITE, capture: file.slice(0, 8) },
      proofId,
    });
    history.push(r.sample);

    // Keep the page only when a decision was made about it.
    const capture = r.event.event === 'ok'
      ? null
      : { ...(await putCapture((await fetchPage()).$.html())), url: `corpus://${SITE}/${file}` };

    const runId = await recordRun({
      targetId: SITE,
      capture,
      result: r,
      proofId,
      groupKey: `${r.event.skeleton.after}:${baseline.field}`,
      stakesRows: 0,
    });

    if (r.status.status === 'quarantined') held = { proofId, runId, file };
  }

  const [{ count: runCount }] = await db.execute('SELECT count(*)::int AS count FROM runs').then((x) => x.rows);
  const [{ count: cellCount }] = await db.execute('SELECT count(*)::int AS count FROM field_runs').then((x) => x.rows);
  console.log(`\ningested  ${runCount} runs, ${cellCount} cells -> postgres`);

  const holes = await heldCells();
  console.log(`held      ${holes.length} cell(s) quarantined`);

  if (held) {
    console.log(`\nreading the held cell back out of postgres (proof ${held.proofId}):\n`);
    console.log(JSON.stringify(await rowByProof(held.proofId), null, 2));
  } else {
    console.log('\nno abstention on this corpus -- expected. Re-run with:');
    console.log(`  node tools/ingest.js ${SITE} --mutate duplicate_similar\n`);
  }

  await closeDb();
};

main().catch(async (e) => { console.error(e); await closeDb(); process.exit(1); });
