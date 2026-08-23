// A provider interstitial is not a broken selector.
//
// This file protects both sides of that distinction. Synthetic fixtures prove
// that known challenge pages are withheld before healing; every measured corpus
// page proves the deliberately narrow detector does not turn ordinary content
// into silence. The latter is the more important regression test: one missed
// block costs a quarantined run, while one false block can hide a watched field
// forever.

import { describe, expect, it } from 'vitest';
import { load } from 'cheerio';
import { readFile, readdir } from 'node:fs/promises';

import { detectBlockedPage } from '../src/detect.js';
import { establishBaseline, runTarget } from '../src/runner.js';
import { pickTarget } from '../src/target.js';

const fixture = (name: string) => readFile(`test/fixtures/blocked/${name}.html`, 'utf8');

describe('a received page that is not the site', () => {
  it.each([
    ['cloudflare', 'cloudflare_challenge_script'],
    ['perimeterx', 'perimeterx_interstitial'],
  ])('recognises the %s interstitial from a vendor-specific marker', async (name, reason) => {
    expect(detectBlockedPage(await fixture(name))).toBe(reason);
  });

  it('requires a short page before treating a login wall as a blocked fetch', async () => {
    const html = await fixture('login-wall');
    expect(detectBlockedPage(html, { baselineBytes: html.length * 5 })).toBe('short_login_wall');
    expect(detectBlockedPage(html, { baselineBytes: html.length })).toBeNull();
  });

  it('does not fire merely because ordinary content discusses captcha or login walls', async () => {
    expect(detectBlockedPage(await fixture('captcha-article'), { baselineBytes: 50_000 })).toBeNull();
  });

  it('withholds the observation before the heal gate can inspect the interstitial', async () => {
    const baselineHtml = await readFile('corpus/ikea/20260804061950.html', 'utf8');
    const $baseline = load(baselineHtml);
    $baseline('script,style,noscript').remove();
    const el = pickTarget($baseline);
    if (!el) throw new Error('the IKEA corpus no longer contains the baseline field');
    const baseline = establishBaseline({
      $: $baseline,
      el,
      field: 'recall_title',
      expected: { regex: 'recall', regexFlags: 'i', minLen: 20 },
    });
    const blockedHtml = await fixture('cloudflare');
    const $blocked = load(blockedHtml);

    const result = await runTarget({
      fetchPage: () => ({ $: $blocked, receivedHtml: blockedHtml }),
      baseline,
      thresholds: { tau: 0.6, delta: 0.16 },
      meta: { run: 1 },
      proofId: 'pr_blocked',
    });

    expect(result.event.attributed_cause).toBe('blocked');
    expect(result.event.event).toBe('blocked');
    expect(result.observed).toBe(false);
    expect(result.gate).toBeNull();
    expect(result.status).toEqual({ status: 'degraded', reason: 'fetch_blocked' });
    expect(result.publishedValue).toBeNull();
    expect(result.row).toMatchObject({
      recall_title: null,
      _assay: {
        proof: 'pr_blocked',
        fields: { recall_title: { status: 'degraded', reason: 'fetch_blocked' } },
      },
    });
  });
});

describe('the measured corpus', () => {
  it('contains no page classified as blocked', async () => {
    const sites = (await readdir('corpus', { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
    const classified: string[] = [];

    for (const site of sites) {
      const files = (await readdir(`corpus/${site}`)).filter((file) => file.endsWith('.html'));
      for (const file of files) {
        const html = await readFile(`corpus/${site}/${file}`, 'utf8');
        // `html.length` would make `short` false for every page, and the two
        // short-body rules unreachable -- a guard that cannot fail. A baseline
        // 5x the page puts every capture inside the 40% window, so all five
        // rules are live against all 77 pages.
        const reason = detectBlockedPage(html, { baselineBytes: html.length * 5 });
        if (reason) classified.push(`${site}/${file}: ${reason}`);
      }
    }

    expect(classified).toEqual([]);
  });
});
