// Blast radius over MCP (F6). Read-only, deliberately.
//
// `assay_blast` in core.ts answers the same question from held cells only --
// which runs the gate refused. This one answers the harder half: what was
// PUBLISHED between the heal that introduced a value and the run where somebody
// noticed. An agent triaging an incident needs that window; it does not need to
// be able to file the retraction or publish a correction, both of which are
// writes an operator signs off on from the CLI or the API.

import { z } from 'zod';
import { blastRadius, retractionCsv, rescrapeList, BlastError } from '../../blast/index.js';
import type { McpTool } from '../server.js';

export const TOOLS: Record<string, McpTool> = {
  assay_blast_radius: {
    description:
      'What was already published that is now suspect: walks a field\'s run '
      + 'history backwards to the heal that introduced the value, and returns '
      + 'the affected runs, row proof ids and re-scrape list. Says "at least" '
      + 'rather than a total when history cannot show the clean run before the '
      + 'boundary. Read-only: it files nothing and corrects nothing.',
    schema: {
      target: z.string().describe('Target id, e.g. ikea.'),
      field: z.string().describe('The field now believed wrong.'),
      at_run: z.number().int().positive().optional()
        .describe('The run where the problem was noticed. Defaults to the newest cell.'),
      from_run: z.number().int().positive().optional()
        .describe('Declare the boundary instead of walking to it.'),
      format: z.enum(['json', 'csv']).optional()
        .describe('csv returns the retraction list as text, for handing downstream.'),
    },
    async run({ target, field, at_run, from_run, format = 'json' }: {
      target: string; field: string; at_run?: number; from_run?: number;
      format?: 'json' | 'csv';
    }) {
      let w;
      try {
        w = await blastRadius({ target, field, at_run, from_run });
      } catch (e) {
        if (e instanceof BlastError) return { error: e.code, detail: e.message };
        throw e;
      }
      if (format === 'csv') return { target, field, csv: await retractionCsv(w) };
      return {
        target: w.target,
        field: w.field,
        last_clean_run: w.last_clean_run,
        first_suspect_run: w.first_suspect_run,
        detected_run: w.detected_run,
        suspect_runs: w.suspect_runs,
        // "at least" when the walk could not see the clean run before the
        // boundary. An agent that reads only this number still reads it right.
        suspect_rows: w.bounded ? w.rows.length : `at least ${w.rows.length}`,
        rows: w.rows.map((r) => ({ proof: r.proof, run: r.run, value: r.value, status: r.status })),
        withheld_runs: w.withheld_runs,
        rescrape: await rescrapeList(w),
        bounded: w.bounded,
        caveats: w.caveats,
      };
    },
  },
};
