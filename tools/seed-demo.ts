// A database with something in it: one heal, one held decision.
//
//   npm run seed:demo
//
// `tools/demo.ts` prints the same two outcomes and writes NOTHING -- it is a
// cheerio script with no store import at all. So a fresh install ends up with a
// product whose whole argument is "look at what it refused to publish" and a
// Decisions screen, a bell and a Home counter that are all empty, because the
// only writer in the repo is `tools/ingest.ts` and that is a corpus harness
// with a flag, not a seeder.
//
// This is `tools/demo.ts`'s two breaks run through the real pipeline and
// persisted: the same `runTarget`, `reserveRunId` and `recordRun` the worker
// and a Bright Data delivery use, so the rows are indistinguishable from rows a
// real run produced. Nothing here writes a status or a reason by hand -- the
// gate decides, and if the corpus ever stops producing one of the two outcomes
// this refuses loudly rather than seeding a demo that quietly says nothing.
//
// Two targets, because one target cannot hold two contradictory verdicts about
// the same field:
//
//   demo-heal__recall_title  rename the class            -> healed,      clear_margin
//   demo-hold__recall_title  rename it, then plant a twin -> quarantined, thin_margin
//
// The held one is the point: `recordRun` writes its `queue_items` row inside
// the same transaction, unresolved, which is what the Decisions screen reads.
//
// Idempotent. `resetTarget` first, because proof_id is derived from
// (target, run, field) and a second seed would otherwise collide on the unique
// constraint rather than replacing what it seeded.

import { load } from 'cheerio';
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { establishBaseline, runTarget, type Baseline } from '../src/runner.js';
import { pickTarget, RECALL_TITLE } from '../src/target.js';
import { MUTATIONS, markTarget } from '../src/mutate.js';
import { putCapture } from '../src/store/captures.js';
import { nextRunAt } from '../src/schedule.js';
import { createTarget, deleteTarget } from '../src/setup/index.js';
import {
  getDb, closeDb, reserveRunId, recordRun, resetTarget, targets,
} from '../src/store/index.js';

const SITE = 'ikea';
const FIELD = 'recall_title';
const CADENCE = '6h';
const TAU = 0.6;
const DELTA = 0.16;
const EXPECTED = { regex: '(recall|rappel|retirada|remedy|alert)', regexFlags: 'i', minLen: 20 };
const CONTRACT = {
  field: FIELD,
  resolver: RECALL_TITLE,
  expected: EXPECTED,
  thresholds: { tau: TAU, delta: DELTA },
};

const sha16 = (s: string): string => createHash('sha256').update(s || '').digest('hex').slice(0, 16);

/** Parse and strip exactly as `ingestPage` does, so the seed reads the same DOM. */
const parse = async (file: string) => {
  const $ = load(await readFile(`corpus/${SITE}/${file}`, 'utf8'));
  $('script,style,noscript').remove();
  return $;
};

/**
 * One seeded target: the real corpus, with one manufactured break at the end.
 *
 * The baseline is taken from the FIRST capture and then moved forward only by
 * heals the gate published, which is what `ingestPage` does -- so the walk
 * across the corpus is the product tracking a site for two and a half years,
 * not a harness re-measuring 2024 thirty times over. The intervening runs are
 * not decoration: `detect()` is blind below `history.length >= 3`, so without
 * them the seeded break arrives with one signal instead of the corroborated
 * evidence a real break arrives with.
 */
async function seedTarget(
  targetId: string, mutations: string[], files: string[],
): Promise<{ status: string; reason: string | null; value: string | null; runId: number }> {
  const db = getDb();
  await db.insert(targets).values({
    targetId,
    url: `corpus://${SITE}`,
    cadence: CADENCE,
    contract: CONTRACT,
    // Scheduled, not paused: pause is the absence of a next run (src/schedule.ts),
    // and a demo whose targets all read "paused" describes a product nobody
    // turned on.
    nextRunAt: nextRunAt(CADENCE),
  }).onConflictDoNothing();
  await resetTarget(targetId);

  const $0 = await parse(files[0]!);
  const el0 = pickTarget($0);
  if (!el0) throw new Error(`no target element in corpus/${SITE}/${files[0]}`);
  const golden = await putCapture($0.html());
  let baseline: Baseline = establishBaseline({
    $: $0, el: el0, field: FIELD, expected: EXPECTED, goldenSha: golden.sha,
  });

  const history: any[] = [];
  let last!: { status: string; reason: string | null; value: string | null; runId: number };

  for (let i = 1; i < files.length; i++) {
    const file = files[i]!;
    const final = i === files.length - 1;

    const $ = await parse(file);
    if (final) {
      const el = pickTarget($);
      if (!el) throw new Error(`nothing to break on corpus/${SITE}/${file}`);
      markTarget($, el);
      for (const id of mutations) {
        const m = MUTATIONS.find((x) => x.id === id);
        if (!m) throw new Error(`unknown mutation "${id}"`);
        if (!m.apply($, el)) throw new Error(`mutation "${id}" does not apply to this element`);
      }
    }
    // Serialised once and handed to the runner rather than left for it to
    // recompute -- same reason as everywhere else, the page is the expensive
    // thing in this loop.
    const pageHtml = $.html();

    const proofId = `pr_${sha16(`${targetId}${file}${FIELD}`)}`;
    const runId = await reserveRunId();
    const r = await runTarget({
      fetchPage: () => ({ $, pageHtml }),
      baseline,
      history,
      thresholds: { tau: TAU, delta: DELTA },
      meta: { run: runId, site: targetId, capture: file.slice(0, 8), via: 'seed' },
      proofId,
    });
    history.push(r.sample);

    // Keep the bytes only when a decision was made about them, exactly as
    // `ingestPage` does: a healthy run has nothing anybody would go back to.
    const capture = r.event.event === 'ok'
      ? null
      : { ...(await putCapture(pageHtml)), url: `corpus://${SITE}/${file}` };

    await recordRun({
      runId,
      targetId,
      capture,
      result: r,
      proofId,
      groupKey: `${r.event.skeleton.after}:${FIELD}`,
    });

    // The baseline moves on a PUBLISHED heal and on nothing else -- the rule
    // `ingestPage` follows, and the reason this walk reads like a real target's
    // history rather than a wall of heals. Two and a half years of genuine
    // drift move the element several times; without this every later capture is
    // still measured against 2024 and heals again for the same reason.
    if (r.status.status === 'healed' && r.gate?.element && capture) {
      baseline = establishBaseline({
        $, el: r.gate.element, field: FIELD, expected: EXPECTED,
        goldenSha: capture.sha, pageHtml,
      });
    }

    last = {
      status: r.status.status,
      reason: (r.status.reason as string | null) ?? null,
      value: r.publishedValue,
      runId,
    };
  }
  return last;
}

/**
 * A target pointed at the live testbed, when there is one.
 *
 * `tools/selfheal.ts` breaks a real page on a real host, and it needs something
 * already under watch to break. Created through `createTarget` rather than an
 * INSERT so the row and its baseline are established by the same code path the
 * product's own first screen uses -- a seeded target that skipped it would be a
 * target no user could have made. Skipped in silence when the variable is
 * unset, and REPORTED but not fatal when the host is unreachable: an
 * unreachable testbed says nothing about the two corpus outcomes above.
 */
async function seedTestbed(base: string): Promise<string> {
  const id = 'demo-testbed';
  const targetId = `${id}__${FIELD}`;
  // Delete rather than skip, so a re-seed re-establishes the baseline instead
  // of leaving whatever a previous break left behind. `deleteTarget` refuses a
  // target with history, which is why the runs go first.
  await resetTarget(targetId);
  await deleteTarget(targetId);
  const r = await createTarget({
    url: `${base.replace(/\/$/, '')}/v/baseline/`,
    // The resolver `tools/selfheal.ts` pins the testbed's tracked notice with.
    // Kept identical on purpose: a demo target that watches a different element
    // from the one the self-heal check breaks is not a subject for it.
    fields: [{
      name: FIELD,
      resolver: { tags: 'h2,h3,a,li', flags: 'i', minLen: 20, maxLen: 140, include: 'halden' },
      expected: { regex: '(recall|aterkallelse)', regexFlags: 'i', minLen: 20 },
      thresholds: { tau: TAU, delta: DELTA },
    }],
    cadence: CADENCE,
    id,
  });
  return r.ok
    ? `${targetId}  baseline "${(r.targets[0]?.baseline_value ?? '').slice(0, 48)}"`
    : `${targetId}  NOT seeded (${r.error}: ${r.detail})`;
}

const main = async () => {
  const files = (await readdir(`corpus/${SITE}`)).filter((f) => f.endsWith('.html')).sort();
  if (files.length < 4) throw new Error(`corpus/${SITE} needs at least four captures to seed`);

  // Both breaks start with the same class rename, because a break is what puts
  // the healer to work at all: the baseline reads through `h2.pub__typography-*`
  // and renaming it is what makes that stop resolving. What separates the two
  // outcomes is the SECOND mutation -- a near-identical twin beside the real
  // element, which leaves the top two candidates within delta of each other.
  // Same page, same break, and the only difference is whether there is one
  // obvious answer or two plausible ones.
  const healed = await seedTarget('demo-heal__recall_title', ['rename_class'], files);
  const held = await seedTarget(
    'demo-hold__recall_title', ['rename_class', 'duplicate_similar'], files,
  );

  // The seed is only worth anything if it produced the two outcomes the screens
  // exist to show. Asserted rather than assumed: a silent seed that wrote two
  // `live` rows leaves every screen looking exactly as empty as before, and the
  // person who ran this would have no way to tell.
  const expect = (got: { status: string; reason: string | null }, status: string, reason: string) => {
    if (got.status !== status || got.reason !== reason) {
      throw new Error(
        `expected ${status}/${reason}, got ${got.status}/${got.reason ?? 'no reason'} -- `
        + 'the corpus or the gate moved, and this seed no longer demonstrates what it claims',
      );
    }
  };
  expect(healed, 'healed', 'clear_margin');
  expect(held, 'quarantined', 'thin_margin');

  console.log(`\nseeded    ${files.length - 1} runs each over corpus/${SITE}\n`);
  console.log(`  healed        demo-heal__recall_title  run ${healed.runId}  clear_margin`);
  console.log(`                published "${(healed.value ?? '').slice(0, 56)}"`);
  console.log(`  held          demo-hold__recall_title  run ${held.runId}  thin_margin`);
  console.log('                published nothing, and left one open decision');

  const testbed = process.env.ASSAY_TESTBED;
  if (testbed) console.log(`  testbed       ${await seedTestbed(testbed)}`);

  console.log('\nDecisions has one item, the bell has one, Home counts one held cell.\n');
  await closeDb();
};

main().catch(async (e) => {
  console.error(e);
  await closeDb().catch(() => {});
  process.exit(1);
});
