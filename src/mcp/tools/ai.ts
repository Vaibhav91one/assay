// Feature H's MCP tools. A FILE next to core.ts, never an edit to it.
//
// Neither tool resolves anything, and `assay_propose` is untouched: it still
// records a nomination and holds. `assay_score_nomination` is the read-only
// view of the scoring `assay_propose` will use once wave 2 wires
// `scoreNomination()` in. Calling it writes nothing at all -- it is the "what
// would the gate say" question, answered without asking the gate to act.

import { z } from 'zod';
import { explain } from '../../store/index.js';
import { scoreNomination, hasKey, type RankedCandidate } from '../../ai/index.js';
import type { McpTool } from '../server.js';

export const TOOLS: Record<string, McpTool> = {
  assay_model_status: {
    description:
      'Whether a model is configured. Assay runs with no model: every AI path '
      + 'degrades to the non-AI behaviour when none is set.',
    schema: {},
    async run() {
      return {
        // Presence only. The key itself is never returned, logged or echoed.
        model_configured: hasKey(),
        detail: hasKey()
          ? 'A model is configured. It proposes candidates; it never decides.'
          : 'No model configured. Field inference is unavailable and discovery '
            + 'ranking falls back to word overlap, labelled as such.',
      };
    },
  },

  assay_score_nomination: {
    description:
      'Score a candidate index for a held cell against the ranked list persisted '
      + 'when the gate abstained. Read-only: it records nothing and resolves '
      + 'nothing. Takes a reference, never a value.',
    schema: {
      proof: z.string().describe('The proof id of the held cell.'),
      candidate_index: z.number().int().min(0)
        .describe('Index into the candidates array. NOT a value.'),
      model_pick: z.number().int().min(0).nullable().optional()
        .describe(
          'Where an independent model says the field went, as an index. Omit if '
          + 'not consulted; null means the model said none of these. Supplying it '
          + 'can only add a reason to hold (method_disagreement), never remove one.',
        ),
    },
    async run({
      proof,
      candidate_index,
      model_pick,
    }: {
      proof: string;
      candidate_index: number;
      model_pick?: number | null;
    }) {
      const x = await explain(proof);
      if (!x) return { error: 'not_found', detail: `No held cell for proof ${proof}.` };
      if (x.status !== 'quarantined') {
        return { error: 'not_held', detail: `That cell is ${x.status}, not held.` };
      }

      const ranked = (x.ranked ?? []) as RankedCandidate[];
      const score = scoreNomination(ranked, candidate_index, { modelPick: model_pick });
      return {
        proof,
        ...score,
        detail:
          score.verdict === 'clears_gate'
            ? 'This nomination would clear the gate. Nothing has been recorded or '
              + 'resolved by asking -- use assay_propose to record it, and a human '
              + 'still settles the item.'
            : `Held: ${score.reason}. A model can propose; it cannot resolve.`,
      };
    },
  },
};
