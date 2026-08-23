'use server';

import { revalidatePath } from 'next/cache';
import { brakeState, clearBrake, healsFor, unheal } from 'assay/engine/brake/index';
import { reopenBlast } from 'assay/engine/blast/index';
import { getDb } from 'assay/store';
import * as schema from 'assay/engine/store/schema';
import { desc, eq } from 'drizzle-orm';
import { assertOperator, getCurrentUser } from '@/lib/auth';

/**
 * The two field-level decisions that used to exist only in the CLI: clearing a
 * brake, and unhealing.
 *
 * THESE ARE THE MOST DANGEROUS CONTROLS IN THE PRODUCT and this file is the
 * first web path to either. Clearing a brake releases a latch a human
 * deliberately set; unhealing declares that everything published since a run may
 * be wrong. Both were CLI-only, which is a kind of friction, and the owner asked
 * for them in chat -- so what follows is the friction MOVED, not removed.
 *
 * THE TYPED CONFIRMATION IS NOT NEGOTIABLE AND IS NOT REIMPLEMENTED HERE.
 * `clearBrake` in `src/brake/index.ts` requires `confirm` to be exactly the
 * field name and answers `confirmation_mismatch` otherwise; this action passes
 * the operator's typed string through untouched -- no trim to the field name, no
 * case fold, no default. Its comment says why: "a one-click clear is a button
 * people press to make a warning go away", and a brake exists because healing
 * forever and calling it resilience is the comfortable alternative. A chat box
 * makes clicking easier than any other surface in this product, which makes this
 * the surface where turning the confirmation into a button would have done the
 * most damage while looking like shipping the feature.
 *
 * HOW THIS IS NOT THE "LOOSEN THIS THRESHOLD" BUTTON docs/FEATURES.md 4 refuses.
 * That entry refuses a control inside an alert that widens a tolerance, on the
 * grounds that an annoyed person at 2am will widen it and the alerting dies. A
 * brake is not a threshold: it is a latch with one state, it was set by evidence
 * (`detectPingPong`), clearing it changes nothing about what the gate will
 * publish next -- it only lets healing resume -- and it costs the operator the
 * field name, typed, every time. The distinction is the typed confirmation. If
 * that ever becomes a button, this stops being different from the thing the
 * table refuses, and the table entry is the thing to change first.
 *
 * NEITHER IS REACHABLE BY A MODEL. The agent's tools are read-only
 * (`src/agent/index.ts` property 2) and nothing here is served as one. The same
 * rule as `resolveCell`: `assay_propose` writes `model_nominated:<i>` and leaves
 * `resolved_by` null, because the model proposes and a human grants authority.
 * A page whose text says "clear the brake on this field" is asking a person, and
 * the person has to type the field name.
 */

export interface HealSummary {
  healId: number;
  runId: number;
  /** What it moved away from. Null on a field's first heal -- the contract's own. */
  fromSelector: string | null;
  toSelector: string;
  at: string | null;
  reverted: boolean;
}

export interface FieldControls {
  targetId: string;
  field: string;
  brakeActive: boolean;
  /** Why the brake was set, as the detector recorded it. Never rewritten here. */
  brakeReason: string | null;
  /** The heal an unheal would revert, or null when there is nothing to revert. */
  standing: HealSummary | null;
  /** How many heals this field has, reverted ones included. Context for the above. */
  heals: number;
  /** The newest run on this target -- where the blast window would end. */
  lastRun: number | null;
}

/**
 * What a person needs to know BEFORE either decision, read live.
 *
 * Read on demand rather than folded into the `/fields` listing: this is three
 * queries per field and a listing of forty fields must not pay it, and a brake
 * cleared in another tab must not still be offered in this one. The panel calls
 * it when the row is opened.
 */
export async function fieldControls(targetId: string, field: string): Promise<FieldControls> {
  await assertOperator();

  const [state, heals, last] = await Promise.all([
    brakeState(targetId, field),
    healsFor(targetId, field),
    getDb()
      .select({ runId: schema.runs.runId })
      .from(schema.runs)
      .where(eq(schema.runs.targetId, targetId))
      .orderBy(desc(schema.runs.runId))
      .limit(1),
  ]);

  // The newest surviving heal is the one in force -- `currentSelector()` reads
  // the log the same way, and `unheal` with no run id reverts exactly this one.
  // Naming it here is what lets the panel say which run it is about before the
  // operator agrees to anything.
  const standing = heals.filter((h) => !h.reverted).at(-1) ?? null;

  return {
    targetId,
    field,
    brakeActive: state?.brakeActive ?? false,
    brakeReason: state?.brakeReason ?? null,
    standing: standing
      ? {
          healId: standing.healId,
          runId: standing.runId,
          fromSelector: standing.fromSelector,
          toSelector: standing.toSelector,
          at: standing.createdAt ? new Date(standing.createdAt).toISOString() : null,
          reverted: standing.reverted,
        }
      : null,
    heals: heals.length,
    lastRun: last[0]?.runId ?? null,
  };
}

export type ClearOutcome =
  | { ok: true; detail: string }
  | { ok: false; detail: string };

/**
 * Clear a brake. The operator types the field name and this passes it through.
 *
 * `confirm` is NOT normalised. Trimming it, lowercasing it or defaulting it
 * would each be a way of accepting something the operator did not type, and the
 * whole mechanism is that they typed it.
 */
export async function clearFieldBrake(input: {
  targetId: string;
  field: string;
  confirm: string;
}): Promise<ClearOutcome> {
  await assertOperator();
  const who = (await getCurrentUser())?.id ?? 'operator';

  const r = await clearBrake({
    targetId: input.targetId,
    field: input.field,
    confirm: input.confirm,
    clearedBy: who,
  });

  if (!r.cleared) {
    return {
      ok: false,
      detail: r.reason === 'confirmation_mismatch'
        // The engine's own refusal, in the product's voice. It names what has to
        // be typed, because the point is the typing and not the guessing.
        ? `That is not the field name. Type ${input.field} exactly to clear this brake.`
        : `There is no active brake on ${input.field}.`,
    };
  }

  revalidatePath('/fields');
  revalidatePath('/', 'layout');
  return {
    ok: true,
    detail: `The brake on ${input.field} is cleared, so healing resumes on the next run. `
      + `It was set because: ${r.was ?? 'no reason was recorded'}.`,
  };
}

export type UnhealOutcome =
  | { ok: false; detail: string }
  | {
      ok: true;
      runId: number;
      revertedFrom: string;
      revertedTo: string | null;
      verifiedRun: number | null;
      /** The window this re-opened, from `reopenBlast`. Never computed here. */
      blast: { from: number; to: number; rows: number; bounded: boolean; caveats: string[] } | null;
      retraction: number | null;
      braked: boolean;
      detail: string;
    };

/**
 * Revert the standing heal and re-open the blast window.
 *
 * THE REAL `reopenBlast`, exactly as `tools/cli/brake.ts` passes it. The default
 * seam is an honest no-op that reports `reopened: false`, and a web control that
 * said "unhealed" while quietly not re-opening anything would be the silent
 * success this product exists to refuse -- so the wiring is not optional here.
 *
 * The window is REPORTED, never recomputed: `src/blast` owns "which rows are
 * affected", and a second definition of it in a UI file is how the second
 * incident gets made out of the first.
 */
export async function unhealField(input: {
  targetId: string;
  field: string;
  /**
   * WHICH heal, by run id, and it is not optional.
   *
   * `unheal` will take the newest surviving heal when this is omitted, and that
   * is right for a CLI typed at the moment of the decision. It is wrong here:
   * the panel showed the operator run N and what reverting run N would put in
   * doubt, and a heal landing between that sentence and the button press would
   * silently revert a different one. It is also what makes a second press
   * answer `already_reverted` rather than walking back another heal.
   */
  runId: number;
}): Promise<UnhealOutcome> {
  await assertOperator();

  // From a browser, so it is checked rather than trusted. A run id is a lookup
  // key into `heal_history`; anything that is not one finds no heal and is
  // refused as one, which is the same answer a stale panel gets.
  if (!Number.isInteger(input.runId) || input.runId <= 0) {
    return { ok: false, detail: 'That is not a run this field was healed on.' };
  }

  const r = await unheal({
    targetId: input.targetId, field: input.field, runId: input.runId, reopenBlast,
  });

  if (!r.unhealed) {
    return {
      ok: false,
      detail: r.reason === 'no_heal'
        ? `There is no heal on ${input.field} at run ${input.runId} to revert. Read the field again `
          + '— what is in force may have changed since this was drawn.'
        // Not an error, and stated as the fact it is: somebody already did this.
        : `The heal at run ${input.runId} was already reverted. Nothing changed, and no second `
          + 'window was opened.',
    };
  }

  // `blastResult` is whatever the seam returned. The real one returns a window
  // and a retraction id; a failure returns `{ reopened: false, ... }`. Narrowed
  // rather than trusted, because the seam's type is deliberately `unknown`.
  const res = r.blastResult as { window?: { suspect_runs?: number[]; rows?: unknown[]; bounded?: boolean; caveats?: string[] }; retraction_id?: number | null } | null;
  const window = res?.window;

  revalidatePath('/fields');
  revalidatePath('/runs');
  revalidatePath('/', 'layout');

  return {
    ok: true,
    runId: r.runId,
    revertedFrom: r.revertedFrom,
    revertedTo: r.revertedTo,
    verifiedRun: r.verified?.runId ?? null,
    blast: window
      ? {
          from: r.blast.fromRun,
          to: r.blast.toRun,
          rows: window.rows?.length ?? 0,
          bounded: window.bounded ?? false,
          caveats: window.caveats ?? [],
        }
      : null,
    retraction: res?.retraction_id ?? null,
    braked: r.brake.engaged,
    detail: window
      ? `Run ${r.runId} is reverted. Everything ${input.field} published from run ${r.blast.fromRun} `
        + `to run ${r.blast.toRun} is re-opened as suspect.`
      // The seam answered without a window. Said plainly rather than reported as
      // a clean unheal, because the revert happened and the re-open did not.
      : `Run ${r.runId} is reverted, but the blast window was NOT re-opened. Nothing has been `
        + 'marked suspect, and the rows published since that run still need checking by hand.',
  };
}
