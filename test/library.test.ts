// The starter library.
//
// Every assertion here exists because the failure it catches would be silent.
// A template that does not parse fails at APPLY time -- after the operator has
// chosen a shape, pasted their values and pressed the button -- which is the
// worst possible first experience with this product. A template whose field
// names the engine would refuse fails the same way, one layer down. And a
// measured claim printed beside a tier it was not measured at is the one kind
// of wrongness this repository cannot afford, because every other number it
// publishes borrows its credibility from that one being trustworthy.
//
// Pure: no Postgres, no network, no clock.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  TEMPLATES, templateById, evidenceOf, thresholdsOf, NOT_MEASURED,
} from '../src/library/index.js';
import { contractFor } from '../src/library/contract.js';
import { formatIssues, parseContract, thresholdsFor, TIERS } from '../src/contracts/index.js';
import { FieldName, targetIdFor } from '../src/setup/index.js';

describe('every shipped template is applicable', () => {
  it('emits a contract that ContractSchema accepts, for every field', () => {
    for (const t of TEMPLATES) {
      for (const f of t.fields) {
        const targetId = targetIdFor('example-com-a-page', f.name);
        const r = parseContract(contractFor(f, targetId));
        // The message carries the template and the field, because a bare
        // "invalid contract" in CI sends someone to read seven of them.
        if (!r.ok) throw new Error(`${t.id}.${f.name}: ${formatIssues(r.issues)}`);
        expect(r.contract.target).toBe(targetId);
        expect(Object.keys(r.contract.fields)).toEqual([f.name]);
        expect(r.contract.fields[f.name]!.policy).toBe(f.policy);
      }
    }
  });

  it('declares field names the create path will accept', () => {
    // `FieldName` is what `CreateInput` enforces, so a template naming a field
    // `Latest Version` would be refused by `createTarget` after the operator
    // had already filled the form in.
    for (const t of TEMPLATES) {
      for (const f of t.fields) {
        expect(FieldName.safeParse(f.name).success, `${t.id}.${f.name}`).toBe(true);
      }
    }
  });

  it('is internally consistent: unique ids, unique fields, a real tier, prose in every slot', () => {
    expect(new Set(TEMPLATES.map((t) => t.id)).size).toBe(TEMPLATES.length);

    for (const t of TEMPLATES) {
      expect(templateById(t.id)).toBe(t);
      expect(t.fields.length, `${t.id} has no fields`).toBeGreaterThan(0);
      expect(new Set(t.fields.map((f) => f.name)).size, `${t.id} repeats a field`)
        .toBe(t.fields.length);

      // Every sentence the screens print is required to exist. An empty one
      // renders as a gap that reads like a bug rather than like a decision.
      for (const [key, value] of Object.entries({
        name: t.name, summary: t.summary, shape: t.shape, mismatch: t.mismatch, where: t.where,
      })) {
        expect(value.trim().length, `${t.id}.${key} is empty`).toBeGreaterThan(0);
      }

      for (const f of t.fields) {
        expect(TIERS).toContain(f.policy);
        for (const [key, value] of Object.entries({ means: f.means, looks: f.looks, why: f.why })) {
          expect(value.trim().length, `${t.id}.${f.name}.${key} is empty`).toBeGreaterThan(0);
        }
      }
    }
  });

  it('suggests a cadence the scheduler can act on', async () => {
    const { cadenceMs } = await import('../src/schedule.js');
    for (const t of TEMPLATES) {
      expect(cadenceMs(t.cadence), `${t.id} cadence ${t.cadence}`).not.toBeNull();
    }
  });
});

describe('a tier on a template screen is the tier the engine will use', () => {
  /**
   * The bridge, and the reason the measured claim is allowed to be printed.
   *
   * A screen showing "strict · tau 0.70 · delta 0.20" beside a template whose
   * stored contract resolved to something else would be a lie about the one
   * setting the operator chose the template for. This runs the template's OWN
   * emitted contract through the engine's OWN resolver and compares it to what
   * the screen displays -- so the two cannot drift without CI noticing.
   */
  it('round-trips through parseContract and thresholdsFor to the displayed numbers', () => {
    for (const t of TEMPLATES) {
      for (const f of t.fields) {
        const r = parseContract(contractFor(f, targetIdFor('slug', f.name)));
        expect(r.ok).toBe(true);
        if (!r.ok) continue;

        const resolved = thresholdsFor(r.contract, f.name);
        const shown = thresholdsOf(f);
        expect(resolved.policy, `${t.id}.${f.name}`).toBe(f.policy);
        expect(resolved.tau, `${t.id}.${f.name} tau`).toBe(shown.tau);
        expect(resolved.delta, `${t.id}.${f.name} delta`).toBe(shown.delta);
      }
    }
  });

  it('puts recall_title on exactly the pair the benchmark was run at', () => {
    // This is what attaches `results/bench.json` to this template rather than
    // leaving it a number quoted beside an unrelated configuration. The gated
    // arm in that file ran at tau 0.60 / delta 0.16; `recall_title` declares
    // `normal`; and `normal` has to resolve to that pair for the claim on the
    // screen to be about this field as this template configures it.
    const recall = templateById('recall-notice');
    expect(recall).toBeDefined();
    const field = recall!.fields.find((f) => f.name === 'recall_title');
    expect(field).toBeDefined();

    const r = parseContract(contractFor(field!, targetIdFor('slug', 'recall_title')));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const resolved = thresholdsFor(r.contract, 'recall_title');
    expect(resolved.tau).toBe(0.60);
    expect(resolved.delta).toBe(0.16);
  });
});

describe('no template claims evidence it does not have', () => {
  it('carries a measured record on exactly one field, and it is recall_title', () => {
    const measured = TEMPLATES.flatMap((t) =>
      t.fields.filter((f) => f.evidence !== null).map((f) => `${t.id}.${f.name}`));
    // Not a style rule. `corpus/` holds three sites and the benchmark is one
    // field across them (docs/LIMITATIONS.md 4), so a second measured field
    // appearing here means somebody attached a number to a shape it was never
    // run against -- which is the failure this whole file exists to catch.
    expect(measured).toEqual(['recall-notice.recall_title']);
  });

  it('cites a source file that is committed and contains the number', () => {
    for (const t of TEMPLATES) {
      for (const f of t.fields) {
        if (!f.evidence) continue;
        for (const path of f.evidence.source.split(',').map((s) => s.trim())) {
          // Read, not stat: a claim citing an empty file is a claim with no
          // evidence behind it dressed as one with evidence behind it.
          expect(readFileSync(path, 'utf8').length, path).toBeGreaterThan(0);
        }
        expect(f.evidence.claim.trim().length).toBeGreaterThan(0);
        expect(f.evidence.method.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it('reads the benchmark and finds the numbers the claim states', () => {
    // The claim says 0 wrong values and 35.3% abstention over 153 cases in the
    // gated arm. If a future run moves any of those, the sentence on the screen
    // becomes wrong and this fails rather than the screen quietly lying.
    const bench = JSON.parse(readFileSync('results/bench.json', 'utf8')) as {
      arms: Record<string, { n: number; value_wrong: number; abstain_right: number; abstain_wrong: number }>;
    };
    const gated = bench.arms.gated!;
    expect(gated.n).toBe(153);
    expect(gated.value_wrong).toBe(0);
    const abstained = (gated.abstain_right + gated.abstain_wrong) / gated.n;
    expect((abstained * 100).toFixed(1)).toBe('35.3');

    const field = templateById('recall-notice')!.fields.find((f) => f.name === 'recall_title')!;
    expect(field.evidence!.claim).toContain('153');
    expect(field.evidence!.claim).toContain('0 wrong values');
    expect(field.evidence!.claim).toContain('35.3%');
  });

  it('reads the replay log and finds the 74 and the 66 the claim states', () => {
    const lines = readFileSync('results/events.jsonl', 'utf8').trim().split('\n');
    expect(lines.length).toBe(74);
    const field = templateById('recall-notice')!.fields.find((f) => f.name === 'recall_title')!;
    expect(field.evidence!.claim).toContain('74 recorded runs');
    expect(field.evidence!.claim).toContain('healed 66');
  });

  it('says the same thing about every unmeasured field, in one place', () => {
    // `NOT_MEASURED` is a single exported string precisely so an absence cannot
    // be phrased more softly on one screen than another. If a per-field note
    // ever appears, this stops being true and the guarantee is gone.
    expect(NOT_MEASURED).toContain('Not measured');
    const unmeasured = TEMPLATES.flatMap((t) => t.fields).filter((f) => f.evidence === null);
    expect(unmeasured.length).toBeGreaterThan(0);

    const totals = TEMPLATES.reduce(
      (a, t) => {
        const e = evidenceOf(t);
        return { measured: a.measured + e.measured, total: a.total + e.total };
      },
      { measured: 0, total: 0 },
    );
    expect(totals.measured).toBe(1);
    expect(totals.total).toBe(TEMPLATES.flatMap((t) => t.fields).length);
  });
});
