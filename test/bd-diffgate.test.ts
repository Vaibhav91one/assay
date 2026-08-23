// The code gate, asserted against the one real Bright Data heal this repo has.
//
// `results/bd-heal-transcript.json` is not a fixture written to make these tests
// pass. It is the verbatim capture of collector c_mt1nrjboski90goqc's heal on
// 2026-08-21, including the proposal a human then rejected and the three reasons
// they gave. Every assertion below is one of those reasons, re-derived from the
// bytes by code instead of by eye.
//
// That is the point of the file: if `diffGate` ever stops catching this, the
// regression is measured against a decision that was actually made, not against
// an example invented to suit the implementation.

import { describe as suite, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { diffGate, pipedFields, assignments } from '../src/bd/diffgate.js';

const transcript = JSON.parse(
  await readFile(fileURLToPath(new URL('../results/bd-heal-transcript.json', import.meta.url)), 'utf8'),
);

suite('the code gate, on the real 2026-08-21 heal', () => {
  const result = diffGate(transcript.preview, { prompt: transcript.prompt });

  it('rejects the proposal a human rejected', () => {
    expect(result.decision).toBe('reject');
  });

  it('catches the corroboration collapse: title_on_detail derived from recall_title', () => {
    const f = result.findings.find(
      (x) => x.rule === 'corroboration_collapse' && x.field === 'title_on_detail',
    );
    expect(f, 'the reason the human actually gave first').toBeTruthy();
    expect(f!.detail).toContain('input.recall_title');
  });

  it('names the widened inter-stage payload that made the collapse possible', () => {
    // The listing stage went from next_stage({url}) to passing the collected
    // fields alongside it. That widening is the mechanism, and it is reported
    // whether or not a later parser has consumed it yet.
    expect(result.newlyPiped).toEqual(
      expect.arrayContaining(['recall_title', 'recall_url', 'date_published']),
    );
    expect(result.newlyPiped, 'url was always piped; it is not new').not.toContain('url');
  });

  it('catches date_published coming back as the stub that caused the defect', () => {
    const f = result.findings.find((x) => x.rule === 'not_attempted' && x.field === 'date_published');
    expect(f, 'named in the prompt, returned as a hardcoded null').toBeTruthy();
  });

  it('does not flag hazard: a null initialiser the proposal then fills', () => {
    // template_b opens with `let hazard = null;` and follows it with four
    // extraction attempts. The human's rejection did not cite hazard, and
    // neither may the gate -- a fabricated reason beside real ones is how an
    // operator learns to stop reading them.
    expect(transcript.preview.diff.template_b.steps[1].parse_code).toContain('let hazard = null;');
    expect(result.findings.some((f) => f.field === 'hazard')).toBe(false);
  });

  it("reads Bright Data's own success: false", () => {
    expect(transcript.preview.success, 'guard the premise, not just the rule').toBe(false);
    expect(result.findings.some((x) => x.rule === 'vendor_preview_failed')).toBe(true);
  });

  it('reaches all three of the recorded rejection reasons', () => {
    expect(new Set(result.findings.map((f) => f.rule))).toEqual(
      new Set(['corroboration_collapse', 'not_attempted', 'vendor_preview_failed']),
    );
  });
});

suite('the gate does not fire on things that are fine', () => {
  it('approves when the proposal changes nothing', () => {
    const t = transcript.preview.diff.template_a;
    const r = diffGate({ success: true, diff: { template_a: t, template_b: t } }, { prompt: '' });
    expect(r.decision).toBe('approve');
    expect(r.findings).toEqual([]);
  });

  it('does not count input.url as a collapse: it was always the stage input', () => {
    // template_a's detail parser reads input.url. A rule that fired on any
    // `input.` reference would reject every healthy multi-stage collector.
    const a = transcript.preview.diff.template_a;
    expect(a.steps[1].parse_code).toContain('input.url');
    const r = diffGate({ success: true, diff: { template_a: a, template_b: a } });
    expect(r.findings).toEqual([]);
  });

  it('ignores a prompt word that is not a field of this collector', () => {
    const a = transcript.preview.diff.template_a;
    const r = diffGate({ success: true, diff: { template_a: a, template_b: a } }, {
      prompt: 'fix the sitemap and the pagination',
    });
    expect(r.findings).toEqual([]);
  });
});

suite('the readers the rules are built on', () => {
  it('reads next_stage keys in both the shorthand and the object form', () => {
    expect(pipedFields({ code: 'next_stage({url});' })).toEqual(['url']);
    expect(pipedFields({ code: 'next_stage({ url: u, recall_title: t });' })).toEqual([
      'url', 'recall_title',
    ]);
  });

  it('reads a top-level assignment and leaves the rest of the parser alone', () => {
    const got = assignments("let a = $('h1').text_sane();\n  return { a };\nconst b = null;");
    expect(got).toEqual([
      { name: 'a', rhs: "$('h1').text_sane();" },
      { name: 'b', rhs: 'null;' },
    ]);
  });
});
