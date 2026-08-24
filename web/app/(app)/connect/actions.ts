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
