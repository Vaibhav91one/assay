// Standing per-field health over MCP (F1 fragility, F3 drift).
//
// A FILE next to core.ts, never an edit to it -- `server.ts` globs this
// directory precisely so nine features never share a list.
//
// What an agent gets here that it cannot get from `assay_status`: the state of
// a field on a day when every run passed. "Which fields will break next" and
// "which pages are moving under us" are the two questions a healthy status
// board cannot answer, and both are answered in words from a closed set --
// never a score, because a float here would relocate the decision to whoever
// cares least about it (CONTRIBUTING, "what gets refused").

import { z } from 'zod';
import { recomputeField, recomputeAll, standingState, WINDOW } from '../../health/observe.js';
import { FRAGILITY_GRADES, DRIFT_STATES } from '../../health/index.js';
import type { McpTool } from '../server.js';

export const TOOLS: Record<string, McpTool> = {
  assay_field_health: {
    description:
      'Standing health per field: how fragile its identity is, and whether the page is '
      + 'drifting under it. Both are properties of the field\'s history, not of one run, so '
      + 'they say something on a day when every run passed. Recomputes from the stored '
      + 'pages and persists the result. Grades come from a closed vocabulary; there is no '
      + 'score. "insufficient_history" is a real answer, not a missing one.',
    schema: {
      target: z.string().optional().describe('Limit to one target id.'),
      field: z.string().optional().describe('One field. Requires target.'),
      window: z.number().int().min(3).max(200).optional()
        .describe(`How many runs back to look. Default ${WINDOW}.`),
    },
    async run({ target, field, window }: { target?: string; field?: string; window?: number } = {}) {
      if (field && !target) throw new Error('field requires target: a field name alone is ambiguous across targets');
      const fields = field
        ? [await recomputeField(target!, field, window ?? WINDOW)]
        : await recomputeAll(target ?? null, window ?? WINDOW);
      return {
        vocabularies: { fragility_grade: FRAGILITY_GRADES, drift_state: DRIFT_STATES },
        fields,
      };
    },
  },

  assay_field_health_stored: {
    description:
      'The standing health already on record, without recomputing it. Fields that have '
      + 'never been assessed come back with nulls rather than being omitted -- an absent '
      + 'row and an assessed-as-fine row are different facts.',
    schema: { target: z.string().optional().describe('Limit to one target id.') },
    async run({ target }: { target?: string } = {}) {
      return { fields: await standingState(target ?? null) };
    },
  },
};
