// Feature H's MCP tools. A FILE next to core.ts, never an edit to it.
//
// `assay_score_nomination` used to be the read-only "what would the gate say"
// view over the ranked list `healGated` persisted when it abstained. It is
// gone along with `assay_propose`: `healGated` no longer runs
// (`src/runner.ts`'s header), `field_runs.ranked` is now always empty, and a
// scorer over an empty list has nothing left to answer.

import { hasKey } from '../../ai/index.js';
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
};
