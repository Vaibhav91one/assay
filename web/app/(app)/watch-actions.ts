'use server';

import { revalidatePath } from 'next/cache';
import { converse, type ChatResult, type Proposal } from 'assay/engine/agent/index';
import { createTarget, CreateInput } from 'assay/engine/setup/index';

export type { ChatResult, Proposal };

/**
 * One turn of "What should Assay watch?".
 *
 * Stateless on the server: the caller holds the history and passes it back, so
 * there is no session store and a reload starts a new conversation rather than
 * resuming a half-remembered one.
 *
 * Never throws for an unconfigured model. `converse` answers `kind: 'manual'`
 * with a sentence saying so, because "Assay runs with no model configured" is
 * a promise the product makes, not an error state.
 */
export async function ask(
  message: string,
  history: { role: 'operator' | 'assay'; text: string }[],
): Promise<ChatResult> {
  return converse({ message, history });
}

export type BuildResult =
  | { ok: true; id: string; fields: { field: string; baseline: string | null }[] }
  | { ok: false; detail: string };

/**
 * Confirm a proposal.
 *
 * The body is `proposal.create` unchanged apart from the fields the operator
 * unticked, so a model's proposal and a hand-typed form take the identical
 * write path -- there is no privileged "the agent said so" route into the
 * store.
 */
export async function build(create: unknown, keep: string[]): Promise<BuildResult> {
  const parsed = CreateInput.safeParse(create);
  if (!parsed.success) return { ok: false, detail: 'That proposal is not a valid target.' };

  const fields = parsed.data.fields.filter((f) => keep.includes(f.name));
  if (fields.length === 0) return { ok: false, detail: 'Keep at least one field.' };

  const r = await createTarget({ ...parsed.data, fields });
  if (!r.ok) return { ok: false, detail: r.detail };

  revalidatePath('/');
  revalidatePath('/decisions');
  return {
    ok: true,
    id: r.id,
    fields: r.targets.map((t) => ({ field: t.field, baseline: t.baseline_value })),
  };
}
