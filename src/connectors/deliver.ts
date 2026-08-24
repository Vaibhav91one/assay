// Discord, which is "POST JSON to a URL".
//
// No SDK. Discord documents an incoming-webhook endpoint that takes a JSON
// body and returns a status; a dependency would add a client, a retry policy
// and a rate limiter to a call that is fifteen lines of `fetch`.
//
// Payload shape below is transcribed from docs fetched 2026-08-22:
//   Discord https://docs.discord.com/developers/resources/webhook   (Execute Webhook)
//           https://docs.discord.com/developers/resources/message    (embed + limits)
//
// ONE THING THAT BITES, documented above and handled here: Discord answers
// 204 with no body at all unless `wait=true`.
//
// Delivery never throws for a delivery failure and never retries. A 404 from
// Discord is a fact the operator has to see; swallowing it, or hiding it
// behind three silent attempts, turns a dead endpoint into a silent one --
// which in a product about not publishing lies is the same bug wearing a
// different hat.

import { secretFor } from './config.js';

/** What was decided, in the vocabulary the rest of the product already uses. */
export interface Announcement {
  target: string;
  field: string;
  /** The detector's sentence. Passed through; never re-worded by a model. */
  diagnosis: string;
  run: number;
  rowsHeld?: number;
}

export interface DeliveryResult {
  kind: 'discord';
  ok: boolean;
  status: number;
  /** The provider's own words on failure. Empty on success. */
  detail: string;
}

const cut = (s: string, n: number): string => (s.length <= n ? s : `${s.slice(0, n - 1)}…`);
const plural = (n: number, w: string): string => `${n} ${w}${n === 1 ? '' : 's'}`;

/** What gets rendered. Both payload builders take this, so the two chat
 *  connectors cannot drift into saying different things about the same run. */
export interface Message {
  headline: string;
  body: string;
  footer: string;
}

/**
 * A break, in the product's voice: "held", never "failed"; no percentage, no
 * "successfully". A held cell reads as held.
 */
export const breakMessage = (a: Announcement): Message => ({
  headline: `${a.target}: I stopped publishing ${a.field}.`,
  body: a.diagnosis,
  footer: `${plural(a.rowsHeld ?? 1, 'row')} held since run ${a.run}. Nothing wrong was published.`,
});

/**
 * A test. Deliberately NOT a fake break -- a test message that reads "I stopped
 * publishing connection" and "1 row held" is a lie, and it teaches the reader
 * to discount the real one.
 */
export const testMessage = (): Message => ({
  headline: 'Assay is connected.',
  body: 'This is a test message. Nothing is held and nothing broke.',
  footer: 'You will only hear from Assay when something needs you.',
});

// --- payload builder (exported so the tests can read the exact JSON) --------

/**
 * One embed. Limits enforced at the field level AND, per Discord's docs, as a
 * 6000-character total across every embed on the message -- validating each
 * field alone passes a payload the API then rejects.
 */
export function discordPayload(m: Message): Record<string, unknown> {
  return {
    embeds: [
      {
        title: cut(m.headline, 256),
        description: cut(m.body, 4096),
        // Amber. A held field is not an error -- it is the product working.
        color: 0xf0_59_00,
        footer: { text: cut(m.footer, 2048) },
      },
    ],
  };
}

// --- the POST ---------------------------------------------------------------

async function post(
  kind: 'discord',
  url: string,
  payload: unknown,
  fetchImpl: typeof fetch,
): Promise<DeliveryResult> {
  let res: Response;
  try {
    res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    // DNS failure, connection refused, TLS error. Status 0 says "never reached
    // the other end", which is a different fact from "rejected by the other end".
    return { kind, ok: false, status: 0, detail: (e as Error).message };
  }

  if (res.ok) return { kind, ok: true, status: res.status, detail: '' };

  // Discord's failure body is JSON. Read as text either way and hand it over
  // verbatim -- the operator is better served by the provider's own words
  // than by ours.
  const body = await res.text().catch(() => '');
  const detail = res.status === 429
    // retry_after is FLOAT SECONDS. Reported, not slept on: this module does
    // not retry, and a caller that wants to needs the real number.
    ? `rate limited; ${body}`
    : cut(body.trim(), 400) || `http ${res.status}`;
  return { kind, ok: false, status: res.status, detail };
}

/**
 * Announce to every configured chat connector.
 *
 * Returns one result per configured connector and never throws: a chat message
 * that could not be delivered must not fail the run that produced it. The
 * caller is responsible for making a false `ok` visible -- see the route and
 * the CLI, both of which surface it, and `episodes.notified`, which stores it.
 */
export async function announce(
  m: Message,
  fetchImpl: typeof fetch = fetch,
): Promise<DeliveryResult[]> {
  const discord = await secretFor('discord');
  const jobs: Promise<DeliveryResult>[] = [];
  if (discord) jobs.push(post('discord', discord.url, discordPayload(m), fetchImpl));
  return Promise.all(jobs);
}

/** One line an operator can read: "discord 404 no_service". */
export const summarise = (rs: DeliveryResult[]): string =>
  rs.length
    ? rs.map((r) => `${r.kind} ${r.ok ? 'ok' : `${r.status} ${r.detail}`}`).join(' · ')
    : 'no chat connector configured';
