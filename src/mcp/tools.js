// The MCP tool surface, as plain functions so they can be tested without a
// transport. `server.js` wires these to stdio; nothing here knows about stdio.
//
// Two rules are the whole point of this server, and neither is negotiable:
//
//   1. There is no assay_resolve. No tool lets a model settle a queue item. A
//      nomination enters as a candidate and clears the same two gates, or it
//      stays held. Every competitor's agent can resolve; ours can only propose.
//
//   2. assay_propose takes an element REFERENCE, never a value, and is scored
//      against the persisted ranked list and the capture that queue item is
//      about. Re-fetching would score a different page and be silently wrong
//      (CRITIQUE 2.4). That is why field_runs.ranked is a stored column.
//
// Rule 2 is also what closes prompt injection by construction: the worst a
// hostile page can do is make a model point at the wrong element, which the
// scorer disagrees with, which is itself grounds to abstain.

import { z } from 'zod';
import {
  getDb, heldCells, runsFor, openQueue, explain, rowByProof,
  targets, queueItems, fieldRuns, eq, isNull,
} from '../store/index.js';

/** Assay's own vocabulary, returned verbatim so an agent reads our words. */
export const TOOLS = {
  assay_status: {
    description: 'What is watching, what is held, and what is waiting on a human.',
    schema: { target: z.string().optional().describe('Limit to one target id.') },
    async run({ target } = {}) {
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
    async run({ field, limit = 50 } = {}) {
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

  assay_decisions: {
    description:
      'The queue: decisions the gate refused to make. Each item carries both '
      + 'answers, the evidence, and what it is holding.',
    schema: { limit: z.number().int().min(1).max(500).optional() },
    async run({ limit = 50 } = {}) {
      const items = await openQueue(limit);
      const out = [];
      for (const it of items) {
        const x = await explain(it.proofId);
        if (!x) continue;
        out.push({
          proof: it.proofId,
          run: x.run,
          field: x.field,
          reason: x.reason,
          stakes_rows: it.stakesRows,
          // The list the gate ranked. A nomination is scored against THIS.
          candidates: x.ranked ?? [],
        });
      }
      return { decisions: out };
    },
  },

  assay_propose: {
    description:
      'Nominate an element for a held field, by INDEX into the candidate list '
      + 'from assay_decisions. Takes a reference, never a value. The nomination '
      + 'is scored against the same gate as any other candidate and may still '
      + 'be held -- this tool cannot resolve anything.',
    schema: {
      proof: z.string().describe('The proof id of the held cell.'),
      candidate_index: z.number().int().min(0)
        .describe('Index into the candidates array. NOT a value.'),
      note: z.string().optional(),
    },
    async run({ proof, candidate_index, note }) {
      const x = await explain(proof);
      if (!x) return { error: 'not_found', detail: `No held cell for proof ${proof}.` };
      if (x.status !== 'quarantined') {
        return { error: 'not_held', detail: `That cell is ${x.status}, not held.` };
      }

      const ranked = x.ranked ?? [];
      const pick = ranked[candidate_index];
      if (!pick) {
        return {
          error: 'no_such_candidate',
          detail: `Index ${candidate_index} is outside the ${ranked.length} candidates on record.`,
          candidates: ranked.length,
        };
      }

      // Re-apply the gate to the PERSISTED list. Same thresholds, same page.
      const best = ranked[0];
      const runnerUp = ranked[1];
      const margin = runnerUp ? Number((best.score - runnerUp.score).toFixed(4)) : 1;
      const TAU = 0.6;
      const DELTA = 0.16;
      const clears = pick.score > TAU && margin > DELTA && candidate_index === 0;

      await getDb().update(queueItems)
        .set({ resolvedBy: null, resolution: `model_nominated:${candidate_index}${note ? `:${note}` : ''}` })
        .where(eq(queueItems.proofId, proof));

      return {
        proof,
        nominated: { index: candidate_index, selector: pick.selector, score: pick.score },
        gate: { tau: TAU, delta: DELTA, margin, score: pick.score },
        // The honest answer is usually this one.
        verdict: clears ? 'clears_gate' : 'still_holding',
        detail: clears
          ? 'The nomination is the clear winner and would publish.'
          : 'Recorded as a nomination. It does not clear the gate, so the cell stays held '
            + 'and a human still decides. A model can propose; it cannot resolve.',
      };
    },
  },

  assay_runs: {
    description: 'Run history for a target, newest first.',
    schema: { target: z.string().optional(), limit: z.number().int().min(1).max(500).optional() },
    async run({ target, limit = 50 } = {}) {
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
    async run({ field }) {
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
    async run({ proof }) {
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
    async run({ url, fields, cadence = '6h' }) {
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

/** Deliberately absent, and asserted in the tests. */
export const REFUSED_TOOLS = ['assay_resolve'];
