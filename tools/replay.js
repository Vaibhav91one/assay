// Replay the full pipeline across the whole corpus to produce an operational
// history: many runs, mostly healthy, some breaks, some abstentions.
//
// This is what the dashboard reads. Each consecutive pair of captures is treated
// as "last known good" -> "this run", which is exactly the situation a scheduled
// scraper is in every morning.
//
//   node tools/replay.js [--out results/events.jsonl]

import { load } from 'cheerio';
import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fingerprint, skeletonHash } from '../src/fingerprint.js';
import { healGated } from '../src/heal.js';
import { detect } from '../src/detect.js';
import { pickTarget } from '../src/target.js';

const outIdx = process.argv.indexOf('--out');
const OUT = outIdx > -1 ? process.argv[outIdx + 1] : 'results/events.jsonl';
const SITES = ['mattel', 'ikea', 'chicco'];
const TAU = 0.6;
const DELTA = 0.16;

const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
const sha = (s) => createHash('sha256').update(s || '').digest('hex').slice(0, 16);

const parse = async (site, file) => {
  const $ = load(await readFile(`corpus/${site}/${file}`, 'utf8'));
  $('script,style,noscript').remove();
  return $;
};


function selectorFor(el) {
  const a = el.attribs || {};
  if (a.id) return `#${a.id}`;
  const cls = (a.class || '').split(/\s+/).filter(Boolean);
  return cls.length ? `${el.name}.${cls[0]}` : el.name;
}

const EXPECTED = { regex: '(recall|rappel|retirada|remedy|alert)', regexFlags: 'i', minLen: 20 };

const run = async () => {
  const events = [];
  let runNo = 0;

  for (const site of SITES) {
    const files = (await readdir(`corpus/${site}`)).filter((f) => f.endsWith('.html')).sort();
    if (files.length < 2) continue;

    // baseline = first capture. Fingerprint is NOT refreshed on every run --
    // refreshing it on an unverified heal is how a healer poisons its own
    // baseline (PLAN.md 5, and what Scrapling does with auto_save).
    const $0 = await parse(site, files[0]);
    const el0 = pickTarget($0);
    if (!el0) continue;
    const target = fingerprint($0, el0);
    const selector = selectorFor(el0);
    const baselineValue = target.text;
    const baselineSkeleton = skeletonHash($0).hash;

    // Anchors must be independent ways of reading THE SAME field, not unrelated
    // page furniture. css and xpath both target the recall title; if they stop
    // agreeing, the field drifted even though both still resolve.
    const readAnchors = ($p) => ({
      css: clean($p(selector).first().text()).slice(0, 200) || null,
      xpath: (() => {
        const css = target.abs_xpath
          .replace(/^\//, '')
          .replace(/\[(\d+)\]/g, ':nth-of-type($1)');
        try { return clean($p(css).first().text()).slice(0, 200) || null; } catch { return null; }
      })(),
    });
    const baselineAnchors = readAnchors($0);

    const nullHistory = [];

    for (let i = 1; i < files.length; i++) {
      const file = files[i];
      runNo++;
      const $n = await parse(site, file);
      const skel = skeletonHash($n).hash;
      const hit = $n(selector).first();
      const value = hit.length ? clean(hit.text()).slice(0, 200) : null;

      const diag = detect({
        field: 'recall_title',
        value,
        expected: EXPECTED,
        history: nullHistory.slice(-6),
        skeleton: { before: baselineSkeleton, after: skel },
        anchors: readAnchors($n),
        anchorsBefore: baselineAnchors,
        pageBytes: $n.html().length,
      });
      nullHistory.push({ nullRate: value == null ? 1 : 0, pageBytes: $n.html().length });

      const base = {
        run: runNo,
        site,
        capture: file.slice(0, 8),
        field: 'recall_title',
        mode: 'tiered',
        thresholds: { tau: TAU, delta: DELTA },
        skeleton: { before: baselineSkeleton, after: skel, changed: baselineSkeleton !== skel },
        value_now: value,
        baseline_value: baselineValue,
        golden_sha256: sha(baselineValue),
      };

      if (!diag.broken) {
        events.push({ ...base, event: 'ok', decision: 'no_action',
          diagnosis: diag.diagnosis, attributed_cause: 'ok' });
        continue;
      }

      const g = healGated($n, target, { tau: TAU, delta: DELTA, limit: 5 });
      const candidates = (g.ranked || []).slice(0, 3).map((r) => ({
        selector: selectorFor(r.el),
        score: Number(r.score.toFixed(4)),
        value: clean(r.fp.text).slice(0, 90),
      }));

      events.push({
        ...base,
        event: g.decision === 'heal' ? 'heal' : 'abstain',
        diagnosis: diag.diagnosis,
        attributed_cause: diag.cause,
        signals: diag.signals,
        candidates,
        score: g.score != null ? Number(g.score.toFixed(4)) : null,
        runner_up: g.runnerUp != null ? Number(g.runnerUp.toFixed(4)) : null,
        margin: g.margin != null ? Number(g.margin.toFixed(4)) : null,
        decision: g.decision === 'heal' ? 'auto_approved' : 'abstain',
        reason: g.reason,
        healed_to: g.decision === 'heal'
          ? { selector: selectorFor(g.element), value: clean(g.fingerprint.text).slice(0, 120) }
          : null,
        approved_by: 'assay',
      });
    }
  }

  await mkdir('results', { recursive: true });
  await writeFile(OUT, events.map((e) => JSON.stringify(e)).join('\n') + '\n');

  const by = (k) => events.filter((e) => e.event === k).length;
  console.log(`\nreplayed ${events.length} runs across ${SITES.length} sites`);
  console.log(`  ok       ${by('ok')}`);
  console.log(`  heal     ${by('heal')}`);
  console.log(`  abstain  ${by('abstain')}`);
  const causes = {};
  events.filter((e) => e.event !== 'ok').forEach((e) => {
    causes[e.attributed_cause] = (causes[e.attributed_cause] || 0) + 1;
  });
  console.log(`  causes   ${JSON.stringify(causes)}`);
  console.log(`-> ${OUT}\n`);
};

run();
