// The fourth benchmark arm: does agreement between independent readings buy back
// the coverage the margin gate abstains away, without buying a wrong value?
//
//   npm run bench:consensus -- [--captures N] [--tau 0.6] [--delta 0.16] [--quorum 2]
//
// `tools/bench.ts` has three arms and is frozen. Its harness is reproduced here
// rather than imported because it runs on import and exports nothing; the
// mutation set, the target picker, the truth-marker canary and the two notions of
// "correct" are deliberately identical, so the `margin gate` row printed below
// MUST match the one `npm run bench` prints. If it does not, this file is wrong
// and nothing else it prints can be trusted. Same rule, same reason, as
// tools/bench-model.ts.
//
// Three arms, because "consensus" is two different products:
//
//   consensus       unanimity INSTEAD of the gate. No tau, no delta, no ranking
//                   threshold -- four independent readings, publish iff they
//                   agree. This is the arm that answers the question worth
//                   asking: can a cheaper, differently-shaped signal hold VALUE
//                   WRONG at 0.0% while abstaining on fewer than 35.3% of cases?
//
//   gate+consensus  unanimity ON TOP of the gate. Can only ever abstain more than
//                   the gate alone, so it cannot win on coverage; it is here to
//                   say whether the gate's remaining publishes survive being
//                   checked by methods that do not share its blind spot.
//
// Read VALUE WRONG first. The gated arm publishes 0.0%; an arm that trades that
// away for coverage has lost, whatever it did to VALUE OK.

import { load } from 'cheerio';
import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import { fingerprint } from '../src/fingerprint.js';
import { healGated } from '../src/heal.js';
import { MUTATIONS, markTarget, TRUTH_ATTR } from '../src/mutate.js';
import { pickTarget, RECALL_TITLE } from '../src/target.js';
import { selectorFor } from '../src/runner.js';
import { consensus, calibrate, STRATEGIES, type ReadContext } from '../src/consensus/index.js';

const arg = (name: string, dflt: number): number => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? Number(process.argv[i + 1]) : dflt;
};
const CAPTURES = arg('captures', 6);
const TAU = arg('tau', 0.6);
const DELTA = arg('delta', 0.16);
const QUORUM = arg('quorum', 2);
const SITES = ['mattel', 'ikea', 'chicco'];

const clean = (s: string | null | undefined): string => (s || '').replace(/\s+/g, ' ').trim();

const fresh = async (site: string, file: string) => {
  const $ = load(await readFile(`corpus/${site}/${file}`, 'utf8'));
  $('script,style,noscript').remove();
  return $;
};

interface Tally {
  correct: number; wrong: number; value_ok: number; value_wrong: number;
  abstain_right: number; abstain_wrong: number; n: number;
}

const blank = (): Tally => ({ correct: 0, wrong: 0, value_ok: 0, value_wrong: 0,
  abstain_right: 0, abstain_wrong: 0, n: 0 });

function tally(b: Tally, expect: string, decision: string, chose?: unknown, valueMatch?: unknown) {
  b.n++;
  if (decision === 'abstain') {
    if (expect === 'none') b.abstain_right++; else b.abstain_wrong++;
    return;
  }
  if (expect === 'none') { b.wrong++; b.value_wrong++; return; }
  if (chose) b.correct++; else b.wrong++;
  if (valueMatch) b.value_ok++; else b.value_wrong++;
}

/** Per-strategy scorecard. This is the evidence that they fail DIFFERENTLY. */
interface Card { voted: number; right: number; wrong: number; silent: number; errors: number; n: number }
const card = (): Card => ({ voted: 0, right: 0, wrong: 0, silent: 0, errors: 0, n: 0 });

const pct = (x: number, n: number): string => (n ? ((x / n) * 100).toFixed(1) + '%' : '-');

const run = async () => {
  const arms = { gated: blank(), consensus: blank(), both: blank(), either: blank() };
  const cross: Record<string, { n: number; value_wrong: number }> = {};
  const cards: Record<string, Card> = Object.fromEntries(STRATEGIES.map((s) => [s.id, card()]));
  const byMutation: Record<string, { label: string; expect: string; gated: Tally; consensus: Tally }> = {};
  const events: Record<string, unknown>[] = [];
  // How many strategies survived the capture-time self-check, per capture.
  const panels: number[] = [];
  const calibrations: Record<string, number> = {};

  for (const site of SITES) {
    const files = (await readdir(`corpus/${site}`)).filter((f) => f.endsWith('.html')).sort();
    const step = Math.max(1, Math.floor(files.length / CAPTURES));
    const sample = files.filter((_, i) => i % step === 0).slice(0, CAPTURES);

    for (const file of sample) {
      const $clean = await fresh(site, file);
      const targetEl = pickTarget($clean);
      if (!targetEl) continue;
      // Everything the strategies are allowed to know, all of it captured from
      // the page that WORKED -- the fingerprint the gate already gets, plus the
      // selector runner.ts already stores and the contract the operator wrote.
      // No strategy is handed anything the product does not have at run time.
      const ctx: ReadContext = {
        target: fingerprint($clean, targetEl),
        selector: selectorFor(targetEl),
        contract: RECALL_TITLE,
      };
      // Capture-time self-check, run on the UNCHANGED page against the element a
      // human confirmed. A strategy that cannot read the field here has never
      // been seen to read it, and is dropped from the panel rather than allowed
      // to veto every later run. See the note on `calibrate`.
      ctx.calibrated = calibrate($clean, targetEl, ctx);
      panels.push(ctx.calibrated.length);
      for (const id of ctx.calibrated) (calibrations[id] ??= 0), calibrations[id]!++;

      for (const mut of MUTATIONS) {
        const $m = await fresh(site, file);
        const el = pickTarget($m);
        if (!el) continue;
        markTarget($m, el);
        let applied = false;
        try { applied = mut.apply($m, el); } catch { applied = false; }
        if (applied === false) continue;

        const truthEl = $m(`[${TRUTH_ATTR}]`).get(0) || null;
        const truthText = truthEl ? clean($m(truthEl).text()) : null;

        // The same strip-and-canary as bench.ts. The truth marker is an answer
        // key; the `selector` strategy resolves raw attributes and the `contract`
        // strategy walks the live DOM, so a leaked marker is contamination here
        // exactly as it is there.
        if (truthEl) $m(truthEl).removeAttr(TRUTH_ATTR);
        if ($m.html().includes(TRUTH_ATTR)) {
          throw new Error(`canary: ${TRUTH_ATTR} leaked into arm input (${site}/${file} ${mut.id})`);
        }
        const isTruth = (e: any) => !!e && e === truthEl;
        const sameValue = (e: any) => !!e && clean($m(e).text()) === truthText;

        byMutation[mut.id] ||= { label: mut.label, expect: mut.expect, gated: blank(), consensus: blank() };

        // --- margin gate, reproduced verbatim. Must match bench.ts.
        const g = healGated($m, ctx.target, { tau: TAU, delta: DELTA, limit: 3 });
        const gOk = g.decision === 'heal' && isTruth(g.element);
        const gVal = g.decision === 'heal' && sameValue(g.element);
        tally(arms.gated, mut.expect, g.decision, gOk, gVal);
        tally(byMutation[mut.id]!.gated, mut.expect, g.decision, gOk, gVal);

        // --- consensus, standing on its own
        const c = consensus($m, ctx, { quorum: QUORUM });
        const cOk = c.decision === 'publish' && isTruth(c.element);
        // Compare the PUBLISHED STRING, not the node. That is what a consensus
        // publish actually emits, and on `expect: none` truthText is null while
        // the published value never is, so a wrong publish cannot score as right.
        const cVal = c.decision === 'publish' && truthText !== null && c.value === truthText;
        const cDec = c.decision === 'publish' ? 'heal' : 'abstain';
        tally(arms.consensus, mut.expect, cDec, cOk, cVal);
        tally(byMutation[mut.id]!.consensus, mut.expect, cDec, cOk, cVal);

        // --- both. The gate chooses the element; consensus only has a veto.
        const bothPub = g.decision === 'heal' && c.decision === 'publish';
        tally(arms.both, mut.expect, bothPub ? 'heal' : 'abstain',
          bothPub && isTruth(g.element), bothPub && sameValue(g.element));

        // --- either. The gate answers where it can; consensus speaks only on the
        // cases the gate held. This is the arm the cross-tab above forces into
        // existence and it is the PERMISSIVE one: two mechanisms each entitled to
        // publish is strictly more publishing than either alone, so it can only
        // add wrong values, never remove them. It is a benchmark arm, not a
        // default, for the same reason bench-model.ts's `tiebreak` is.
        const eitherPub = g.decision === 'heal' || c.decision === 'publish';
        const eEl = g.decision === 'heal' ? g.element : c.element;
        const eVal = g.decision === 'heal'
          ? sameValue(g.element)
          : truthText !== null && c.value === truthText;
        tally(arms.either, mut.expect, eitherPub ? 'heal' : 'abstain',
          eitherPub && isTruth(eEl), eitherPub && eVal);

        // The cross-tab itself: where the two mechanisms disagree about whether to
        // answer at all. Two mechanisms that fail on the same cases leave the
        // off-diagonal empty, and then neither can cover for the other.
        const key = `${g.decision === 'heal' ? 'gate heals' : 'gate holds'} / `
          + `${c.decision === 'publish' ? 'consensus publishes' : 'consensus holds'}`;
        const cell = (cross[key] ??= { n: 0, value_wrong: 0 });
        cell.n++;
        if (eitherPub && (mut.expect === 'none' || !eVal)) cell.value_wrong++;

        for (const v of c.votes) {
          const k = cards[v.strategy]!;
          k.n++;
          if (v.error) { k.errors++; k.silent++; continue; }
          if (v.value === null) { k.silent++; continue; }
          k.voted++;
          if (truthText !== null && v.value === truthText) k.right++; else k.wrong++;
        }

        events.push({
          site, capture: file.slice(0, 8), mutation: mut.id, expect: mut.expect,
          gated: { decision: g.decision, reason: g.reason, correct: gOk },
          consensus: {
            decision: c.decision, reason: c.reason, voted: c.voted,
            distinct: c.distinct, correct: cOk,
            votes: c.votes.map((v) => ({ strategy: v.strategy, resolved: v.value !== null,
              right: truthText !== null && v.value === truthText, error: v.error ?? null })),
          },
        });
      }
    }
  }

  const line = '-'.repeat(88);
  console.log('\nASSAY BENCHMARK  -  fourth arm, agreement between independent readings');
  console.log(`sites ${SITES.join(', ')}  |  ${CAPTURES} captures each  |  ${MUTATIONS.length} mutations`);
  console.log(`tau ${TAU}   delta ${DELTA}   quorum ${QUORUM}   strategies ${STRATEGIES.map((s) => s.id).join(', ')}\n`);

  console.log(line);
  console.log('arm'.padEnd(32) + 'n'.padStart(5) + 'exact'.padStart(9)
    + 'VALUE OK'.padStart(11) + 'VALUE WRONG'.padStart(13) + 'abstained'.padStart(12));
  console.log(line);
  const labels: Record<string, string> = {
    gated: `margin gate (t${TAU}/d${DELTA})`,
    consensus: `consensus (unanimous, q${QUORUM})`,
    both: 'margin gate AND consensus',
    either: 'margin gate OR consensus',
  };
  for (const [k, a] of Object.entries(arms)) {
    console.log(labels[k]!.padEnd(32) + String(a.n).padStart(5)
      + pct(a.correct, a.n).padStart(9)
      + pct(a.value_ok, a.n).padStart(11)
      + pct(a.value_wrong, a.n).padStart(13)
      + pct(a.abstain_right + a.abstain_wrong, a.n).padStart(12));
  }
  console.log(line);

  console.log('\nVALUE WRONG = returned a confidently incorrect VALUE. This is the number');
  console.log('nobody in the field publishes, and it is the whole point of the project.\n');

  // Whether the two mechanisms are worth composing at all lives here, not in the
  // totals. Two rules that hold the same cells are one rule with two names.
  console.log(line);
  console.log('who answers'.padEnd(46) + 'n'.padStart(6) + 'V-WRONG if either publishes'.padStart(28));
  console.log(line);
  for (const [k, v] of Object.entries(cross)) {
    console.log(k.padEnd(46) + String(v.n).padStart(6) + String(v.value_wrong).padStart(28));
  }
  console.log(line + '\n');

  // Independence, measured rather than asserted. Strategies whose `wrong` columns
  // rise and fall together are variations of one idea wearing four names, and a
  // unanimity rule over them is worth nothing.
  console.log(line);
  console.log('strategy'.padEnd(14) + 'on panel'.padStart(10) + 'resolved'.padStart(10)
    + 'agreed w/ truth'.padStart(17) + 'resolved WRONG'.padStart(16)
    + 'no answer'.padStart(11) + 'threw'.padStart(8));
  console.log(line);
  const captures = panels.length;
  for (const [id, k] of Object.entries(cards)) {
    console.log(id.padEnd(14) + pct(calibrations[id] ?? 0, captures).padStart(10)
      + pct(k.voted, k.n).padStart(10)
      + pct(k.right, k.n).padStart(17) + pct(k.wrong, k.n).padStart(16)
      + pct(k.silent, k.n).padStart(11) + String(k.errors).padStart(8));
  }
  console.log(line);
  console.log('"on panel" = passed the capture-time self-check; the other columns are over');
  console.log('the cases where it was on the panel. "resolved WRONG" counts every case where');
  console.log('the honest answer was to resolve nothing, so it is high by construction on the');
  console.log('removal mutation. Columns that rise and fall together mean the strategies are');
  console.log('variations of one idea and unanimity over them is worth nothing.\n');
  console.log(`panel size: ${(panels.reduce((a, b) => a + b, 0) / (captures || 1)).toFixed(2)} `
    + `of ${STRATEGIES.length} strategies, mean over ${captures} captures.\n`);

  console.log(line);
  console.log('per mutation'.padEnd(38) + 'gate V-WRONG'.padStart(14) + 'cons V-WRONG'.padStart(14) + 'cons abstain'.padStart(16));
  console.log(line);
  for (const m of Object.values(byMutation)) {
    const tag = m.expect === 'none' ? ' [tau]' : m.expect === 'ambiguous' ? ' [delta]' : '';
    console.log((m.label + tag).padEnd(38)
      + pct(m.gated.value_wrong, m.gated.n).padStart(14)
      + pct(m.consensus.value_wrong, m.consensus.n).padStart(14)
      + pct(m.consensus.abstain_right + m.consensus.abstain_wrong, m.consensus.n).padStart(16));
  }
  console.log(line);

  await mkdir('results', { recursive: true });
  await writeFile('results/bench-consensus.json', JSON.stringify({
    arms, cards, byMutation, events, calibrations, panels, cross,
    config: { tau: TAU, delta: DELTA, quorum: QUORUM, captures: CAPTURES, sites: SITES,
      strategies: STRATEGIES.map((s) => ({ id: s.id, independence: s.independence })) },
  }, null, 2));
  console.log(`\n${events.length} events -> results/bench-consensus.json\n`);
};

run();
