// Reports over MCP: the incident record, the diff, and the digest.
//
// Read-only, all three. An agent can compose an account of what happened and
// quote it; it cannot send a digest and it cannot settle anything the gate
// refused -- that rule is enforced by the loader, not by politeness here.
//
// The diff tool returns `withheld` entries with no value on them at all. An
// agent that asks "did this change?" and gets a hole must not be able to read
// the answer as "no" -- which is exactly what an empty string or a null value
// pair would let it do.

import { z } from 'zod';
import { incidentRecord, episodes } from '../../reports/incident.js';
import { fieldHistory } from '../../reports/diff.js';
import { composeDigest } from '../../reports/digest.js';
import { incidentMarkdown } from '../../reports/render.js';
import type { McpTool } from '../server.js';

export const TOOLS: Record<string, McpTool> = {
  assay_incidents: {
    description:
      'Break episodes on record: what opened them, what closed them, and which '
      + 'are still open. The list an incident record is composed from.',
    schema: {
      target: z.string().optional().describe('Limit to one target id.'),
      limit: z.number().int().min(1).max(500).optional(),
    },
    async run({ target, limit = 50 }: { target?: string; limit?: number } = {}) {
      return { incidents: await episodes({ targetId: target, limit }) };
    },
  },

  assay_incident: {
    description:
      'The incident record for one episode (F14): what broke, when, what was '
      + 'changed, what was HELD, what was retracted, what is still suspect, and '
      + 'who decided. Composed entirely from stored records -- the refusals are '
      + 'part of it, because a report of fixes alone is marketing.',
    schema: {
      episode: z.number().int().positive(),
      format: z.enum(['json', 'markdown']).optional()
        .describe('markdown returns the sendable file; json returns the records.'),
    },
    async run({ episode, format = 'json' }: { episode: number; format?: 'json' | 'markdown' }) {
      const record = await incidentRecord(episode);
      if (!record) return { error: 'not_found', detail: `No episode ${episode}.` };
      return format === 'markdown' ? { markdown: incidentMarkdown(record) } : record;
    },
  },

  assay_diff: {
    description:
      'Value history for one field across runs. Three states: changed, '
      + 'unchanged, and withheld. A withheld run carries NO value and NO '
      + 'before/after pair -- "we published nothing here, deliberately" is not '
      + '"nothing changed", and this tool will not let you read it as one.',
    schema: {
      target: z.string(),
      field: z.string(),
      limit: z.number().int().min(1).max(1000).optional(),
    },
    async run({ target, field, limit = 200 }: { target: string; field: string; limit?: number }) {
      return fieldHistory({ targetId: target, field, limit });
    },
  },

  assay_digest: {
    description:
      'The periodic report over a window: changes, withheld fields, and the '
      + 'unchanged count. The header is "N changes, M withheld" and never a bare '
      + 'change count. Composes only -- it does not send.',
    schema: {
      since: z.coerce.date().describe('Start of the window, inclusive.'),
      until: z.coerce.date().describe('End of the window, exclusive.'),
    },
    async run({ since, until }: { since: Date; until: Date }) {
      if (!(since < until)) return { error: 'bad_window', detail: 'since must be before until.' };
      return composeDigest({ since, until });
    },
  },
};
