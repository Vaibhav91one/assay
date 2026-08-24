// `digestMessage` turns a `Digest` into the same `Message` shape a break
// announcement uses, so it rides `connectors/deliver.ts`'s existing
// `slackPayload`/`discordPayload`/`announce` rather than a second delivery
// path. Digest's own rule -- a withheld field never reads as a change -- has
// to survive the trip into that shape, so it's asserted here too, not just in
// `composeDigest` itself.

import { describe, it, expect } from 'vitest';
import { digestMessage, type Digest } from '../src/reports/digest.js';
import { slackPayload } from '../src/connectors/deliver.js';

const base: Digest = {
  since: new Date('2026-08-17T00:00:00Z'),
  until: new Date('2026-08-24T00:00:00Z'),
  changes: [{ target: 'vercel__changelog', field: 'entries', what: '4 new entries' }],
  withheld: [{ target: 'replit__changelog', field: 'entries', what: 'held since run 41 — a break diagnosis' }],
  unchanged: 9,
  subject: '1 change, 1 withheld',
};

describe('digestMessage', () => {
  it('carries the subject as the headline, unchanged', () => {
    expect(digestMessage(base).headline).toBe(base.subject);
  });

  it('lists changed and withheld fields, each once', () => {
    const m = digestMessage(base);
    expect(m.body).toContain('vercel__changelog');
    expect(m.body).toContain('replit__changelog');
  });

  it('never lets a withheld field read under CHANGED', () => {
    const m = digestMessage(base);
    const changedSection = m.body.split('WITHHELD')[0]!;
    expect(changedSection).not.toContain('replit__changelog');
  });

  it('states the unchanged count in the footer', () => {
    expect(digestMessage(base).footer).toContain('9 fields unchanged');
  });

  it('says so plainly when there is nothing to report', () => {
    const empty: Digest = { ...base, changes: [], withheld: [], unchanged: 0 };
    expect(digestMessage(empty).body).toMatch(/nothing/i);
  });

  it('produces a valid Slack Block Kit payload downstream', () => {
    const payload = slackPayload(digestMessage(base));
    expect(payload.text).toBe(base.subject);
    expect(Array.isArray(payload.blocks)).toBe(true);
  });
});
