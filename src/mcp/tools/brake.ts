// The brake, over MCP. Read-only, deliberately.
//
// There is no assay_clear_brake and there will not be one. The brake exists
// because a field is publishing values from the wrong A/B variant and nobody
// noticed; clearing it resumes exactly that, and the decision belongs to a
// person who typed the field name. Handing a model a tool that turns the
// warning off is the same mistake as assay_resolve (src/mcp/server.ts rule 1),
// one table over.
//
// What a model CAN do here is the useful half: see which fields are braked,
// read the sequence of heals that tripped it, and explain it to the human who
// has to decide. That is the job.

import { z } from 'zod';
import { listBrakes, healsFor, brakeState, detectPingPong } from '../../brake/index.js';
import type { McpTool } from '../server.js';

export const TOOLS: Record<string, McpTool> = {
  assay_brakes: {
    description:
      'Fields where healing has been STOPPED because the selector is oscillating. '
      + 'A braked field holds; it does not heal and does not publish. Clearing a '
      + 'brake is a human action from the CLI or the API and requires typing the '
      + 'field name -- there is no tool for it here.',
    schema: {},
    async run() {
      const brakes = await listBrakes();
      return {
        brakes: brakes.map((b) => ({
          target: b.targetId,
          field: b.field,
          reason: b.brakeReason,
          since: b.updatedAt,
          clear_with: `assay brake clear ${b.targetId}/${b.field} --confirm ${b.field}`,
        })),
        // Said explicitly so a model reporting "0 brakes" does not read as
        // "healing is fine" -- it reads as "nothing has tripped yet".
        note: brakes.length === 0 ? 'No field is braked. Healing is unrestricted.' : null,
      };
    },
  },

  assay_heal_history: {
    description:
      'Every heal recorded for one field, oldest first, including reverted ones, '
      + 'plus whether the sequence currently counts as thrashing. Reverted rows '
      + 'are kept on purpose: the oscillation pattern is the evidence.',
    schema: {
      target: z.string().describe('Target id.'),
      field: z.string().describe('Field name.'),
    },
    async run({ target, field }: { target: string; field: string }) {
      const rows = await healsFor(target, field);
      const verdict = detectPingPong(rows);
      const state = await brakeState(target, field);
      return {
        target,
        field,
        heals: rows.map((r) => ({
          heal: r.healId,
          run: r.runId,
          from: r.fromSelector,
          to: r.toSelector,
          reverted: r.reverted,
          at: r.createdAt,
        })),
        thrashing: verdict.thrashing,
        returns: verdict.returns,
        window_days: verdict.windowDays,
        threshold: verdict.threshold,
        verdict: verdict.reason,
        brake_active: state?.brakeActive ?? false,
      };
    },
  },
};
