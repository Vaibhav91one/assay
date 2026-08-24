'use server';

// File a retraction (F9). Recomputes the window server-side rather than
// trusting anything the client sent -- same rule `library/actions.ts`
// documents for `approve()`: a client-proposed window is a claim, not a fact,
// and the only trustworthy one is read fresh off the store at the moment of
// the write.

import { revalidatePath } from 'next/cache';
import { blastRadius, recordRetraction, markExported, BlastError } from 'assay/engine/blast/index';
import { assertOperator } from '@/lib/auth';

export type FileOutcome =
  | { ok: true; retractionId: number; created: boolean; rows: number; exportedAt: string }
  | { ok: false; detail: string };

export async function fileRetraction(target: string, field: string, atRun?: number): Promise<FileOutcome> {
  await assertOperator();
  try {
    const window = await blastRadius({ target, field, at_run: atRun });
    const r = await recordRetraction(window);
    const exportedAt = r.exported_at ?? (await markExported(r.retraction_id));
    revalidatePath(`/blast/${encodeURIComponent(target)}/${encodeURIComponent(field)}`);
    return {
      ok: true,
      retractionId: r.retraction_id,
      created: r.created,
      rows: window.rows.length,
      exportedAt: exportedAt.toISOString(),
    };
  } catch (e) {
    if (e instanceof BlastError) return { ok: false, detail: e.message };
    throw e;
  }
}
