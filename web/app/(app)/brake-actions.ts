'use server';

import { revalidatePath } from 'next/cache';
import {
  clearBrakeFor, fieldControlsFor, unhealFieldFor,
} from '@/lib/brake';
import { assertOperator, getCurrentUser } from '@/lib/auth';

export type {
  ClearOutcome, FieldControls, HealSummary, UnhealOutcome,
} from '@/lib/brake';

/**
 * The auth wrapper over the two field-level decisions, and the revalidation
 * after them. The decisions themselves are `web/lib/brake.ts`, whose header
 * says why they are not in this file.
 *
 * `assertOperator()` first in every export -- `test/actions-auth.test.ts` calls
 * each one with no arguments and requires a refusal before an argument is read.
 * `getCurrentUser()` is here rather than in the read module because who is
 * clearing a brake is a fact about the REQUEST; the module underneath takes it
 * as a parameter and cannot invent one.
 */

export async function fieldControls(targetId: string, field: string) {
  await assertOperator();
  return fieldControlsFor(targetId, field);
}

export async function clearFieldBrake(input: {
  targetId: string;
  field: string;
  /** Typed by the operator, and passed through untouched. See `web/lib/brake.ts`. */
  confirm: string;
}) {
  await assertOperator();
  const who = (await getCurrentUser())?.id ?? 'operator';
  const r = await clearBrakeFor({ ...input, clearedBy: who });
  if (r.ok) {
    // The Fields screen and the rail's counts both read brake state, and a
    // cleared brake that leaves either of them saying "stopped" is half a fix.
    revalidatePath('/fields');
    revalidatePath('/', 'layout');
  }
  return r;
}

export async function unhealField(input: { targetId: string; field: string; runId: number }) {
  await assertOperator();
  const r = await unhealFieldFor(input);
  if (r.ok) {
    revalidatePath('/fields');
    revalidatePath('/runs');
    revalidatePath('/', 'layout');
  }
  return r;
}
