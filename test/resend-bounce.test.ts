// `verifyResendWebhook`/`parseResendEvent` — the one signature check in this
// repo verified against a hand-rolled implementation rather than the `svix`
// library, so it gets its own suite proving the algorithm against real HMAC
// output, not just "it didn't throw".

import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import {
  verifyResendWebhook, parseResendEvent, ResendWebhookError, REPLAY_WINDOW_SEC,
} from '../src/connectors/resend-bounce.js';

const SECRET = 'whsec_' + Buffer.from('a real 32-byte-ish key for testing').toString('base64');

function sign(id: string, timestamp: string, body: string, secret = SECRET) {
  const key = Buffer.from(secret.slice('whsec_'.length), 'base64');
  const sig = createHmac('sha256', key).update(`${id}.${timestamp}.${body}`).digest('base64');
  return `v1,${sig}`;
}

describe('verifyResendWebhook', () => {
  const id = 'msg_test123';
  const now = new Date('2026-08-24T12:00:00Z');
  const ts = String(Math.floor(now.getTime() / 1000));
  const body = JSON.stringify({ type: 'email.bounced', data: { email_id: 're_abc' } });

  it('accepts a correctly signed request', () => {
    expect(() => verifyResendWebhook(
      { id, timestamp: ts, signature: sign(id, ts, body) }, body, SECRET, now,
    )).not.toThrow();
  });

  it('accepts when the real signature is one of several space-delimited versions', () => {
    const real = sign(id, ts, body);
    const decoy = 'v1,' + Buffer.from('not it').toString('base64');
    expect(() => verifyResendWebhook(
      { id, timestamp: ts, signature: `${decoy} ${real}` }, body, SECRET, now,
    )).not.toThrow();
  });

  it('rejects a body that does not match what was signed', () => {
    const tampered = JSON.stringify({ type: 'email.bounced', data: { email_id: 're_DIFFERENT' } });
    expect(() => verifyResendWebhook(
      { id, timestamp: ts, signature: sign(id, ts, body) }, tampered, SECRET, now,
    )).toThrow(ResendWebhookError);
  });

  it('rejects a signature computed with the wrong secret', () => {
    const wrongSecret = 'whsec_' + Buffer.from('a different key entirely').toString('base64');
    expect(() => verifyResendWebhook(
      { id, timestamp: ts, signature: sign(id, ts, body, wrongSecret) }, body, SECRET, now,
    )).toThrow(ResendWebhookError);
  });

  it('rejects a timestamp outside the replay window', () => {
    const stale = String(Number(ts) - REPLAY_WINDOW_SEC - 60);
    expect(() => verifyResendWebhook(
      { id, timestamp: stale, signature: sign(id, stale, body) }, body, SECRET, now,
    )).toThrow(/stale_timestamp|replay/);
  });

  it('rejects when any header is missing', () => {
    expect(() => verifyResendWebhook(
      { id: null, timestamp: ts, signature: sign(id, ts, body) }, body, SECRET, now,
    )).toThrow(ResendWebhookError);
  });

  it('rejects a secret with no whsec_ prefix', () => {
    expect(() => verifyResendWebhook(
      { id, timestamp: ts, signature: sign(id, ts, body) }, body, 'not-a-real-secret', now,
    )).toThrow(ResendWebhookError);
  });
});

describe('parseResendEvent', () => {
  it('parses a recognised event and keeps the email id', () => {
    const e = parseResendEvent(JSON.stringify({ type: 'email.bounced', data: { email_id: 're_abc' } }));
    expect(e.type).toBe('email.bounced');
    expect(e.data.email_id).toBe('re_abc');
  });

  it('refuses an event type this receiver does not recognise', () => {
    expect(() => parseResendEvent(JSON.stringify({ type: 'email.opened', data: { email_id: 're_abc' } })))
      .toThrow(ResendWebhookError);
  });

  it('refuses a bounce event missing email_id', () => {
    expect(() => parseResendEvent(JSON.stringify({ type: 'email.bounced', data: {} })))
      .toThrow(ResendWebhookError);
  });

  it('refuses invalid JSON', () => {
    expect(() => parseResendEvent('not json')).toThrow(ResendWebhookError);
  });
});
