// Scratch driver for manual end-to-end checking. Not a test; deleted before merge.
//
// Proves the load-bearing claim: a target created through the setup path and one
// driven straight through `ingestPage` (what tools/worker.ts does) produce
// records that differ in NOTHING but provenance.
import { readFile, readdir } from 'node:fs/promises';
import { createTarget, deleteTarget } from './index.js';
import { ingestPage } from '../connectors/ingest.js';
import { getDb, targets, closeDb, sql } from '../store/index.js';

const RECALL = {
  tags: 'h2,h3,a,li', minLen: 20, maxLen: 140,
  include: 'recall|rappel|retirada|remedy kit',
  exclude: 'recalls\\.gov|learn more|click here|^product recalls$',
  flags: 'i',
};
const EXPECTED = { regex: '(recall|rappel|retirada|remedy|alert)', regexFlags: 'i', minLen: 20 };
const CONTRACT = { field: 'recall_title', resolver: RECALL, expected: EXPECTED };

const d = getDb();
for (const id of ['cmp_setup__recall_title', 'cmp_cli__recall_title']) {
  await d.execute(sql`DELETE FROM queue_items WHERE proof_id IN (SELECT fr.proof_id FROM field_runs fr JOIN runs r ON r.run_id=fr.run_id WHERE r.target_id=${id})`);
  await d.execute(sql`DELETE FROM field_runs WHERE run_id IN (SELECT run_id FROM runs WHERE target_id=${id})`);
  await d.execute(sql`DELETE FROM runs WHERE target_id=${id}`);
  await d.execute(sql`DELETE FROM targets WHERE target_id=${id}`);
}

// A: through the setup path.
const a = await createTarget({
  url: 'corpus://ikea', cadence: '6h', id: 'cmp_setup',
  fields: [{ name: 'recall_title', resolver: RECALL, expected: EXPECTED }],
});
if (!a.ok) { console.log('CREATE FAILED', a); await closeDb(); process.exit(1); }

// B: the worker's path -- insert the row, call ingestPage directly.
const files = (await readdir('corpus/ikea')).filter((f) => f.endsWith('.html')).sort();
const html = await readFile(`corpus/ikea/${files.at(-1)}`, 'utf8');
await d.insert(targets).values({
  targetId: 'cmp_cli__recall_title', url: 'corpus://ikea', cadence: '6h', contract: CONTRACT,
});
const b = await ingestPage({
  target: { targetId: 'cmp_cli__recall_title', url: 'corpus://ikea', contract: CONTRACT },
  html, via: 'worker',
});

const { rows } = await d.execute(sql`
  SELECT r.target_id, r.status AS run_status, r.skeleton_hash, r.page_bytes, r.page_sha,
         fr.field, fr.value, fr.status, fr.reason, fr.golden_sha256, fr.capture_sha256,
         fr.ranked, fr.held_since_run, fr.group_key
  FROM runs r JOIN field_runs fr ON fr.run_id = r.run_id
  WHERE r.target_id IN ('cmp_setup__recall_title','cmp_cli__recall_title')
  ORDER BY r.target_id`);

const [cli, setup] = rows as any[];
const strip = (o: any) => { const { target_id, ...rest } = o; return rest; };
console.log('SETUP RECORD', JSON.stringify(strip(setup), null, 2));
console.log('WORKER RECORD', JSON.stringify(strip(cli), null, 2));
console.log('\nIDENTICAL apart from target_id:', JSON.stringify(strip(setup)) === JSON.stringify(strip(cli)));
console.log('setup run', a.targets[0]!.baseline_run, 'via=setup   |  worker run', b.runId, 'via=worker');

await deleteTarget('cmp_setup__recall_title');
await closeDb();
