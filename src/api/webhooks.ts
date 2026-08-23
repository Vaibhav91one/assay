// Outbound webhooks, signed so a receiver can prove the payload is ours.
//
// The rule that decides whether this feature is loved or muted (FEATURES F5):
// ONE message per break episode per field. A template change that breaks 400
// pages sends one webhook with a count, not 400. The episodes table is what
// makes that possible -- an episode is open until the field recovers, and a
// second break inside an open episode is not a new event.

import { createHmac, timingSafeEqual } from 'node:crypto';
import { eq, and, isNull } from 'drizzle-orm';
import { getDb, episodes } from '../store/index.js';

/** The closed set of outbound events. A new one is a schema change, not a string. */
export type WebhookEvent =
  | 'field.held'
  | 'episode.opened'
  | 'brake.tripped'
  // A retraction is the one event a consumer cannot reconstruct from its own
  // data: it says rows they have already ingested are wrong. The other three
  // describe what Assay is withholding; this one describes what it let out.
  | 'retraction.filed';

export const EVENTS: WebhookEvent[] = [
  'field.held', 'episode.opened', 'brake.tripped', 'retraction.filed',
];

/**
 * The observation carried by a break notification.
 *
 * Build it here so every signed delivery keeps the same distinction as the
 * REST envelope: this field exists and is withheld, rather than absent or a
 * value that happened to be null. `proof` is the resolvable join back to the
 * full explanation.
 */
export function heldObservation({
  target,
  field,
  run,
  proof,
  reason,
  diagnosis,
}: {
  target: string;
  field: string;
  run: number;
  proof: string;
  reason: string | null;
  diagnosis?: unknown;
}): Record<string, unknown> {
  return {
    target,
    field,
    run,
    [field]: null,
    status: 'quarantined',
    reason,
    proof,
    ...(diagnosis === undefined ? {} : { diagnosis }),
  };
}

/**
 * `t=<unix>,v1=<hex>` over `<t>.<body>`.
 *
 * The timestamp is inside the signed string, not beside it, so a captured
 * request cannot be replayed later with a fresh timestamp.
 */
export function sign(body: string, secret: string, at = Math.floor(Date.now() / 1000)): string {
  const mac = createHmac('sha256', secret).update(`${at}.${body}`).digest('hex');
  return `t=${at},v1=${mac}`;
}

/**
 * Verify a signature. Constant-time, and rejects anything older than
 * `toleranceSec` so a stolen-but-valid request has a short life.
 */
export function verify(
  body: string,
  header: string | null | undefined,
  secret: string,
  toleranceSec = 300,
  now = Date.now(),
): boolean {
  const m = /^t=(\d+),v1=([0-9a-f]+)$/.exec(header || '');
  if (!m) return false;
  const [, ts, mac] = m;
  if (Math.abs(Math.floor(now / 1000) - Number(ts)) > toleranceSec) return false;

  const expected = createHmac('sha256', secret).update(`${ts}.${body}`).digest('hex');
  const a = Buffer.from(mac, 'hex');
  const b = Buffer.from(expected, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Open an episode, or return null if one is already open for this field.
 *
 * This is the deduplication. Callers fire a webhook only when this returns an
 * episode; a break arriving inside an open episode is the same incident.
 */
export async function openEpisode({
  targetId,
  field,
  cause,
  runId,
}: {
  targetId: string;
  field: string;
  cause?: string | null;
  runId: number;
}) {
  const d = getDb();
  const [existing] = await d.select().from(episodes)
    .where(and(
      eq(episodes.targetId, targetId),
      eq(episodes.field, field),
      isNull(episodes.closedRun),
    )).limit(1);
  if (existing) return null;

  const [row] = await d.insert(episodes)
    .values({ targetId, field, cause: cause ?? null, openedRun: runId })
    .returning();
  return row;
}

/** Close the open episode for a field, if there is one. */
export async function closeEpisode({
  targetId,
  field,
  runId,
}: {
  targetId: string;
  field: string;
  runId: number;
}) {
  const d = getDb();
  const [row] = await getDb().update(episodes).set({ closedRun: runId })
    .where(and(
      eq(episodes.targetId, targetId),
      eq(episodes.field, field),
      isNull(episodes.closedRun),
    )).returning();
  return row ?? null;
}

/**
 * POST a signed event. Returns the delivery result rather than throwing: a
 * webhook a receiver cannot accept must not fail the run that produced it.
 */
export async function deliver({
  url,
  secret,
  event,
  data,
  fetchImpl = fetch,
}: {
  url: string;
  secret: string;
  event: WebhookEvent;
  data: unknown;
  fetchImpl?: typeof fetch;
}): Promise<{ ok: boolean; status: number; error?: string }> {
  if (!EVENTS.includes(event)) throw new Error(`unknown event "${event}"`);
  const body = JSON.stringify({ event, data, sent_at: new Date().toISOString() });
  try {
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-assay-signature': sign(body, secret),
        'x-assay-event': event,
      },
      body,
    });
    return { ok: res.ok, status: res.status };
  } catch (e) {
    return { ok: false, status: 0, error: (e as Error).message };
  }
}
