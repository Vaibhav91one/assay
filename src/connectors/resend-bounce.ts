// The Resend bounce/complaint webhook receiver.
//
// Verified against docs fetched 2026-08-24:
//   https://resend.com/docs/dashboard/webhooks/verify-webhooks-requests
//   https://resend.com/docs/dashboard/webhooks/event-types
//   https://docs.svix.com/receiving/verifying-payloads/how-manual
//
// What those establish, and what each one forces here:
//
//   * Resend signs webhooks via Svix, not its own scheme: `svix-id`,
//     `svix-timestamp`, `svix-signature` headers, secret shaped `whsec_<base64>`.
//   * The signed content is exactly `${svix-id}.${svix-timestamp}.${rawBody}`,
//     joined by literal dots -- NOT the parsed JSON re-stringified, which would
//     not byte-match what was actually signed.
//   * HMAC-SHA256, keyed on the base64-decoded secret (after the `whsec_`
//     prefix), the digest itself base64-encoded.
//   * `svix-signature` is space-delimited `v1,<sig>` entries -- multiple
//     versions can be present; a match against ANY of them is a valid
//     signature, per Svix's own verification contract (key rotation sends
//     both old and new signatures during the rotation window).
//   * No npm dependency added for this (`svix` is not installed, and this repo
//     already hand-rolls comparable HMAC checks -- see `verifyBearer` in
//     `brightdata.ts`). The algorithm above is short, stable, and documented
//     plainly enough that a hand implementation is the smaller commitment.
//
// Timestamp tolerance mirrors `brightdata.ts`'s `REPLAY_WINDOW_SEC`: a
// signature is only checked against a body that also has to have arrived
// within a bounded window, so a captured request cannot be replayed forever
// even with a valid old signature still on file during a rotation.

import { timingSafeEqual, createHmac } from 'node:crypto';
import { z } from 'zod';
import { episodeByNotifiedEmailId, markNotified } from '../store/index.js';
import { incidentRecord } from '../reports/incident.js';
import { deliver, heldObservation } from '../api/webhooks.js';

export const REPLAY_WINDOW_SEC = 300;

export class ResendWebhookError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
    this.name = 'ResendWebhookError';
  }
}

/**
 * Verify a Resend/Svix webhook. Throws `ResendWebhookError` on any failure --
 * missing headers, bad secret shape, signature mismatch, stale timestamp.
 * Never returns a partial or "probably fine" result: a webhook receiver that
 * is unsure says no.
 */
export function verifyResendWebhook(
  headers: { id: string | null; timestamp: string | null; signature: string | null },
  rawBody: string,
  secret: string,
  now: Date = new Date(),
): void {
  // 401, not 400: an absent credential is the same class of refusal as a
  // wrong one, and this repo's whole `/api/v1` tree fails closed on "no
  // credentials" with 401 uniformly (`test/auth.test.ts`) -- a webhook with
  // no svix headers at all is exactly that case, not a malformed-body 400.
  if (!headers.id || !headers.timestamp || !headers.signature) {
    throw new ResendWebhookError(401, 'missing_headers', 'svix-id, svix-timestamp and svix-signature are all required.');
  }
  const ts = Number(headers.timestamp);
  if (!Number.isFinite(ts) || Math.abs(now.getTime() / 1000 - ts) > REPLAY_WINDOW_SEC) {
    throw new ResendWebhookError(401, 'stale_timestamp', 'svix-timestamp is missing, malformed, or outside the replay window.');
  }
  if (!secret.startsWith('whsec_')) {
    throw new ResendWebhookError(500, 'bad_secret', 'RESEND_WEBHOOK_SECRET is not shaped like a Svix secret (expected a whsec_ prefix).');
  }

  const key = Buffer.from(secret.slice('whsec_'.length), 'base64');
  const signedContent = `${headers.id}.${headers.timestamp}.${rawBody}`;
  const expected = createHmac('sha256', key).update(signedContent).digest();

  const presented = headers.signature.split(' ').map((part) => part.split(',')[1]).filter(Boolean);
  const matched = presented.some((sig) => {
    let buf: Buffer;
    try {
      buf = Buffer.from(sig!, 'base64');
    } catch {
      return false;
    }
    return buf.length === expected.length && timingSafeEqual(buf, expected);
  });
  if (!matched) throw new ResendWebhookError(401, 'bad_signature', 'Signature did not match any value in svix-signature.');
}

/** The fields this receiver needs off a bounce/complaint event. Everything else in the payload is ignored. */
const ResendEvent = z.object({
  type: z.enum(['email.bounced', 'email.complained', 'email.delivered']),
  data: z.object({ email_id: z.string() }).loose(),
});
export type ResendEvent = z.infer<typeof ResendEvent>;

/**
 * React to a verified, parsed event: nothing on `email.delivered` (that is
 * the good outcome and this receiver exists for the other two), and on
 * `email.bounced`/`email.complained`, fall back to the webhook -- same
 * mechanism `notifyBreak()` (`tools/worker.ts`) uses when the send itself
 * throws, run here because THIS failure could not have been known
 * synchronously: Resend accepted the send and only reported the bounce later.
 *
 * Silent on an email id this receiver does not recognise (a digest send, a
 * delivered event, or one from before this feature existed) -- not every
 * email Assay sends is a break alert, and there is nothing to react to for
 * ones that are not one of ours.
 *
 * Returns what happened, for the route to log; never throws for a delivery
 * failure downstream of the lookup, matching `notifyBreak()`'s own "never
 * fatal" rule -- a webhook that also fails still leaves an honest `notified`.
 */
export async function reactToResendEvent(event: ResendEvent): Promise<
  { action: 'ignored' } | { action: 'no_such_episode' } | { action: 'fell_back_to_webhook'; ok: boolean }
> {
  if (event.type === 'email.delivered') return { action: 'ignored' };

  const episodeId = await episodeByNotifiedEmailId(event.data.email_id);
  if (episodeId == null) return { action: 'no_such_episode' };

  const record = await incidentRecord(episodeId);
  const held = record?.held[0];
  const hook = process.env.ASSAY_WEBHOOK_URL;
  const reasonWord = event.type === 'email.bounced' ? 'bounced' : 'marked as spam';

  if (!hook || !record || !held) {
    await markNotified(episodeId, `undelivered: email ${reasonWord}, no webhook fallback configured`);
    return { action: 'fell_back_to_webhook', ok: false };
  }

  try {
    await deliver({
      url: hook,
      secret: process.env.ASSAY_WEBHOOK_SECRET || '',
      event: 'episode.opened',
      data: heldObservation({
        target: record.target, field: record.field, run: held.run,
        proof: held.proof, reason: held.why?.code ?? null,
        diagnosis: record.cause?.plain ?? undefined,
      }),
    });
    await markNotified(episodeId, `webhook (email ${reasonWord})`);
    return { action: 'fell_back_to_webhook', ok: true };
  } catch (e) {
    await markNotified(episodeId, `undelivered: email ${reasonWord}, webhook also failed: ${(e as Error).message}`);
    return { action: 'fell_back_to_webhook', ok: false };
  }
}

export function parseResendEvent(rawBody: string): ResendEvent {
  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    throw new ResendWebhookError(400, 'bad_json', 'Body is not valid JSON.');
  }
  const parsed = ResendEvent.safeParse(json);
  if (!parsed.success) {
    throw new ResendWebhookError(400, 'bad_event', 'Not a bounce, complaint, or delivered event this receiver recognises.');
  }
  return parsed.data;
}
