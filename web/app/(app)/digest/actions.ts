'use server';

import { composeDigest, digestMessage } from 'assay/engine/reports/digest';
import { announce, summarise } from 'assay/engine/connectors/deliver';
import { assertOperator } from '@/lib/auth';

export type SendOutcome = { ok: true; summary: string } | { ok: false; detail: string };

/**
 * "Send a test" (Figma `digest` 436:203) -- delivers the REAL current window,
 * not a fake preview message. `announce()` (`src/connectors/deliver.ts`)
 * already sends to whatever chat connector is configured and never throws for
 * a delivery failure, so this reports what came back rather than assuming ok.
 */
export async function sendDigestNow(sinceIso: string, untilIso: string): Promise<SendOutcome> {
  await assertOperator();
  const since = new Date(sinceIso);
  const until = new Date(untilIso);
  if (Number.isNaN(since.getTime()) || Number.isNaN(until.getTime())) {
    return { ok: false, detail: 'Not a valid window.' };
  }

  const digest = await composeDigest({ since, until });
  const results = await announce(digestMessage(digest));
  if (!results.length) return { ok: false, detail: 'No chat connector is configured yet.' };
  return { ok: true, summary: summarise(results) };
}
