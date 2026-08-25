// The live-fetch cross-check and the independent model read, both asserted
// against the same real 2026-08-21 heal `test/bd-diffgate.test.ts` uses.
//
// `liveCorroborationCheck`'s fetch is injected here -- no real network call --
// so this suite is deterministic and runs with no Bright Data token. The real
// Web Unlocker path is exercised live in `tools/bd-heal.ts` itself; this file
// only has to prove the field-by-field logic is correct against real template
// shapes, not that the network works.

import { describe as suite, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { diffGate } from '../src/bd/diffgate.js';
import { liveCorroborationCheck, agentVerify } from '../src/bd/verify.js';
import { hasKey } from '../src/ai/model.js';

const transcript = JSON.parse(
  await readFile(fileURLToPath(new URL('../results/bd-heal-transcript.json', import.meta.url)), 'utf8'),
);
const gate = diffGate(transcript.preview, { prompt: transcript.prompt });

suite('liveCorroborationCheck, on the real 2026-08-21 heal', () => {
  it('reports both collapsed fields as not verifiable -- they are step-1, per-item URLs', async () => {
    // title_on_detail and product_page_url are assigned in template_a's SECOND
    // step, which reads input.url from whatever next_stage({url}) handed it --
    // a specific recall's detail page, only known after step 0 actually runs.
    // This is the exact real case that makes a full live re-check impossible
    // without executing the vendor's own navigation, and the honest answer is
    // "not verifiable", never a guess.
    const live = await liveCorroborationCheck(transcript.preview, gate.findings);
    expect(live.url).toBe('https://www.ikea.com/us/en/customer-service/product-support/recalls/');
    expect(live.fields.map((f) => f.field).sort()).toEqual(['product_page_url', 'title_on_detail']);
    for (const f of live.fields) {
      expect(f.verifiable, f.field).toBe(false);
      expect(f.detail).toContain('step 1');
    }
  });

  it('fetches the fixed template.url via the injected fetcher, not the real network', async () => {
    const seen: string[] = [];
    const stub = async (url: string) => { seen.push(url); return { html: '<html></html>', via: 'stub' }; };
    await liveCorroborationCheck(transcript.preview, gate.findings, stub);
    expect(seen).toEqual(['https://www.ikea.com/us/en/customer-service/product-support/recalls/']);
  });

  it('re-checks a step-0 field for real, against injected HTML', async () => {
    // A synthetic collapse on `recall_title`, which template_a's own step 0
    // assigns from `$('h1.page-title').text_sane()` -- fabricated selector,
    // real assignment shape, so the step-0 path (the one real case does not
    // exercise) gets a real test too.
    const a = transcript.preview.diff.template_a;
    const withStep0Field = {
      ...a,
      steps: [
        { ...a.steps[0], parse_code: "let recall_title = $('h1.page-title').text_sane();" },
        a.steps[1],
      ],
    };
    const preview = { success: true, diff: { template_a: withStep0Field, template_b: withStep0Field } };
    const findings = [{ rule: 'corroboration_collapse' as const, field: 'recall_title', detail: 'x' }];

    const present = await liveCorroborationCheck(preview, findings,
      async () => ({ html: '<h1 class="page-title">Real recall notice</h1>', via: 'stub' }));
    expect(present.fields[0]).toMatchObject({
      field: 'recall_title', verifiable: true, oldSelector: 'h1.page-title',
      stillResolves: true, text: 'Real recall notice',
    });

    const absent = await liveCorroborationCheck(preview, findings,
      async () => ({ html: '<body>redesigned, no h1 at all</body>', via: 'stub' }));
    expect(absent.fields[0]).toMatchObject({
      field: 'recall_title', verifiable: true, stillResolves: false, text: null,
    });
  });

  it('reports a fetch failure as evidence, never as a silent empty result', async () => {
    const a = transcript.preview.diff.template_a;
    const withStep0Field = {
      ...a,
      steps: [{ ...a.steps[0], parse_code: "let recall_title = $('h1').text_sane();" }, a.steps[1]],
    };
    const preview = { success: true, diff: { template_a: withStep0Field, template_b: withStep0Field } };
    const findings = [{ rule: 'corroboration_collapse' as const, field: 'recall_title', detail: 'x' }];

    const live = await liveCorroborationCheck(preview, findings, async () => { throw new Error('bright data 503'); });
    expect(live.fetchError).toContain('503');
    expect(live.fields).toEqual([]);
  });

  it('is a no-op with no corroboration_collapse findings, but still names the template url', async () => {
    // `url` is read from template_a regardless of findings -- only the fetch
    // itself is skipped when there is nothing to re-check.
    const live = await liveCorroborationCheck(transcript.preview, [], async () => {
      throw new Error('must not be called');
    });
    expect(live).toEqual({
      url: 'https://www.ikea.com/us/en/customer-service/product-support/recalls/',
      fetchedVia: null, fetchError: null, fields: [],
    });
  });
});

suite('agentVerify degrades to null, never throws, with no model configured', () => {
  it('returns null rather than guessing when no key is present', async () => {
    // `hasKey()` is the real gate -- this session happens to have model access
    // (CLI login counts, per its own header), so this assertion only means
    // something when that is false; skipped rather than faked otherwise.
    if (hasKey()) return;
    const live = await liveCorroborationCheck(transcript.preview, gate.findings);
    const verdict = await agentVerify({
      diffFindings: gate.findings, live,
      templateBCode: JSON.stringify(transcript.preview.diff.template_b).slice(0, 500),
      prompt: transcript.prompt,
    });
    expect(verdict).toBeNull();
  });
});

suite('agentVerify, on the real 2026-08-21 heal, with a real model', () => {
  it('recommends against the proposal a human rejected, and agrees with the code gate', async () => {
    if (!hasKey()) return;
    const live = await liveCorroborationCheck(transcript.preview, gate.findings);
    const verdict = await agentVerify({
      diffFindings: gate.findings, live,
      templateBCode: JSON.stringify(transcript.preview.diff.template_b).slice(0, 2000),
      prompt: transcript.prompt,
    });
    expect(verdict).not.toBeNull();
    expect(verdict!.recommendation).toBe('looks_risky');
    expect(verdict!.agrees_with_diff_gate).toBe(true);
    expect(verdict!.concerns.length).toBeGreaterThan(0);
  }, 60_000);
});
