// The core MCP tool surface, as plain functions so they can be tested without a
// transport. `server.ts` globs this directory and wires what it finds to stdio;
// nothing here knows about stdio, and a feature adds tools by adding a FILE
// next to this one -- never by editing this one.
//
// The whole point of this server, and it is not negotiable: there is no
// assay_resolve. No tool lets a model settle a queue item -- every
// competitor's agent can resolve; ours cannot.
//
// `assay_propose` used to be the other half of that sentence -- a nomination
// scored against the persisted `field_runs.ranked` list, never a re-fetch
// (CRITIQUE 2.4), so the worst a hostile page could do was make a model point
// at the wrong element. It is gone: `healGated`, the only thing that ever
// populated `ranked`, no longer runs (`src/runner.ts`'s header) -- Bright
// Data's collector repair is the only recovery path left, and it is a
// human-approved, out-of-band flow this MCP surface has no part in.

import { z } from 'zod';
import {
  getDb, heldCells, runsFor, openQueue, explain, rowByProof,
  targets, fieldRuns, eq, isNull,
} from '../../store/index.js';
import type { McpTool } from '../server.js';

/** Assay's own vocabulary, returned verbatim so an agent reads our words. */
export const TOOLS: Record<string, McpTool> = {
  assay_status: {
    description: 'What is watching, what is held, and what is waiting on a human.',
    schema: { target: z.string().optional().describe('Limit to one target id.') },
    async run({ target }: { target?: string } = {}) {
      const d = getDb();
      const all = await d.select().from(targets);
      const held = await heldCells();
      const queue = await openQueue(500);
      const scoped = target ? all.filter((t) => t.targetId === target) : all;
      return {
        targets: scoped.map((t) => ({ id: t.targetId, url: t.url, cadence: t.cadence })),
        held_cells: held.length,
        waiting_on_you: queue.length,
      };
    },
  },

  assay_held: {
    description: 'Every quarantined cell: null, labelled, and never filled.',
    schema: { field: z.string().optional(), limit: z.number().int().min(1).max(500).optional() },
    async run({ field, limit = 50 }: { field?: string; limit?: number } = {}) {
      const held = await heldCells();
      return {
        held: held
          .filter((h) => !field || h.field === field)
          .slice(0, limit)
          .map((h) => ({
            proof: h.proofId, run: h.runId, field: h.field,
            value: null, status: h.status, reason: h.reason,
            held_since_run: h.heldSinceRun,
          })),
      };
    },
  },

  assay_runs: {
    description: 'Run history for a target, newest first.',
    schema: { target: z.string().optional(), limit: z.number().int().min(1).max(500).optional() },
    async run({ target, limit = 50 }: { target?: string; limit?: number } = {}) {
      const runs = await runsFor(target || null, limit);
      return {
        runs: runs.map((r) => ({
          run: r.runId, target: r.targetId, status: r.status,
          started_at: r.startedAt, capture: r.captureSha,
        })),
      };
    },
  },

  assay_blast: {
    description:
      'Which rows a break covers and how far back -- the boundary between the '
      + 'last clean run and detection.',
    schema: { field: z.string().describe('The field that broke.') },
    async run({ field }: { field: string }) {
      const d = getDb();
      const cells = await d.select().from(fieldRuns).where(eq(fieldRuns.field, field));
      const held = cells.filter((c) => c.status === 'quarantined');
      if (!held.length) return { field, suspect_runs: [], detail: 'Nothing held for that field.' };
      const first = Math.min(...held.map((h) => h.heldSinceRun ?? h.runId));
      const last = Math.max(...held.map((h) => h.runId));
      return {
        field,
        first_suspect_run: first,
        detected_run: last,
        suspect_runs: held.map((h) => h.runId).sort((a, b) => a - b),
        // Overstating this would make the tool as unreliable as the thing it replaces.
        confidence: 'Cells held by the gate. Values were withheld, not published wrong.',
      };
    },
  },

  assay_explain: {
    description: 'Where a published value came from: run, capture, anchors, and whether it was healed.',
    schema: { proof: z.string() },
    async run({ proof }: { proof: string }) {
      const x = await explain(proof);
      if (!x) return { error: 'not_found' };
      const row = await rowByProof(proof);
      return { ...x, row };
    },
  },

  assay_watch: {
    description:
      'Start watching a page. Emits the target contract for review -- it does '
      + 'not write to the store, because policy belongs in a reviewed change.',
    schema: {
      url: z.string().url(),
      fields: z.array(z.string()).min(1),
      cadence: z.string().optional(),
    },
    async run({ url, fields, cadence = '6h' }: { url: string; fields: string[]; cadence?: string }) {
      return {
        contract: {
          url,
          cadence,
          fields: Object.fromEntries(fields.map((f) => [f, {
            policy: 'normal', on_abstain: 'quarantine', auto_approve: 'clear_margin',
          }])),
        },
        detail: 'Review and apply this contract to start the watch.',
      };
    },
  },
};

