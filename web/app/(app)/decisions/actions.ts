'use server';

import { revalidatePath } from 'next/cache';
import { resolve, undo, Resolution } from 'assay/engine/decisions/index';

/**
 * What the queue screen gets back from an answer.
 *
 * `applied` is the whole point of F8: one answer can settle every open item
 * that shares a group_key, and the operator has to be told how many that was
 * -- silently settling 40 cells is indistinguishable from settling one.
 */
export type Outcome =
  | { ok: true; kind: 'resolved'; applied: number; resolution: Resolution }
  | { ok: true; kind: 'undone'; applied: number }
  | { ok: false; detail: string };

export async function resolveCell(proof: string, resolution: Resolution): Promise<Outcome> {
  const parsed = Resolution.safeParse(resolution);
  if (!parsed.success) return { ok: false, detail: 'Not one of the four answers.' };

  const r = await resolve({ proof, resolution: parsed.data });
  if (!r.ok) return { ok: false, detail: r.detail };

  revalidatePath('/decisions');
  return { ok: true, kind: 'resolved', applied: r.applied, resolution: r.resolution };
}

export async function undoCell(proof: string): Promise<Outcome> {
  const r = await undo({ proof });
  if (!r.ok) return { ok: false, detail: r.detail };

  revalidatePath('/decisions');
  return { ok: true, kind: 'undone', applied: r.applied };
}
