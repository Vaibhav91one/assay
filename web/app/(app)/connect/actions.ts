'use server';

import { revalidatePath } from 'next/cache';
import { put, remove, issueDetail, type Kind } from 'assay/engine/connectors/config';
import { assertOperator } from '@/lib/auth';
import { z } from 'zod';

export type ConnectOutcome = { ok: true } | { ok: false; detail: string };

/**
 * The put/remove forms Settings' own Connections tab never had (it only
 * ever displayed `describe()` — see that tab's own header). Same rule as
 * every other write in this app: recompute/reparse server-side, never trust
 * the client's claim about its own input beyond what it typed.
 */
export async function putConnector(kind: Kind, config: unknown): Promise<ConnectOutcome> {
  await assertOperator();
  try {
    await put(kind, config);
  } catch (e) {
    if (e instanceof z.ZodError) return { ok: false, detail: e.issues.map(issueDetail).join('; ') };
    throw e;
  }
  revalidatePath('/connect');
  revalidatePath('/settings');
  return { ok: true };
}

export async function removeConnector(kind: Kind): Promise<ConnectOutcome> {
  await assertOperator();
  await remove(kind);
  revalidatePath('/connect');
  revalidatePath('/settings');
  return { ok: true };
}

export type BrightDataTest =
  | { ok: true; zones: { name: string; type: string; status: string }[] }
  | { ok: false; detail: string };

/**
 * "Is BRIGHTDATA_API_TOKEN actually valid" — the outbound half (Assay calling
 * Bright Data), distinct from the inbound delivery secret `putConnector`
 * writes. `GET /zone/get_all_zones` is the lightest real read on Bright
 * Data's account-management API: no dataset id, no snapshot id, nothing this
 * token might not have yet — verified live against
 * https://docs.brightdata.com/api-reference/account-management-api/get-all-zones
 * and against the real token in this deployment's environment (2026-08-24):
 * 200 with the real zone list on a good token, 401 on a bad one.
 */
export async function testBrightData(): Promise<BrightDataTest> {
  await assertOperator();
  const token = process.env.BRIGHTDATA_API_TOKEN;
  if (!token) return { ok: false, detail: 'BRIGHTDATA_API_TOKEN is not set in the environment.' };

  let res: Response;
  try {
    res = await fetch('https://api.brightdata.com/zone/get_all_zones', {
      headers: { authorization: `Bearer ${token}` },
    });
  } catch (e) {
    return { ok: false, detail: `Could not reach Bright Data: ${(e as Error).message}` };
  }
  if (!res.ok) {
    return { ok: false, detail: `Bright Data answered ${res.status} — the token is not valid.` };
  }
  const zones = (await res.json()) as { name: string; type: string; status: string }[];
  return { ok: true, zones };
}
