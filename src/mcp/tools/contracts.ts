// Contracts, read-only, for an agent that wants to know why a field was held.
//
// There is no assay_contract_write, and the reason is the same one that makes
// assay_resolve refused: a threshold is policy, and policy changes in a PR
// with a reviewer, not in a tool call nobody diffed. An agent can read the
// contract and say the tier is wrong. Changing it is a human's commit.

import { z } from 'zod';
import { thresholdsFor, DEFAULT_THRESHOLDS } from '../../contracts/index.js';
import { contractHistory, latestContract } from '../../contracts/store.js';
import type { McpTool } from '../server.js';

export const TOOLS: Record<string, McpTool> = {
  assay_contract: {
    description:
      'The field contract in force for a target: what the operator wrote, and the '
      + 'tau/delta each field is gated at. A field the contract does not mention is '
      + 'gated at the engine defaults, which is stated rather than left blank.',
    schema: {
      target: z.string().describe('Target id, e.g. ikea/product.'),
      field: z.string().optional().describe('Limit to one field.'),
    },
    async run({ target, field }: { target: string; field?: string }) {
      const current = await latestContract(target);
      if (!current) {
        return {
          target,
          version: null,
          yaml: null,
          governed_fields: [],
          defaults: DEFAULT_THRESHOLDS,
          note: 'No contract. Every field is gated at the engine defaults.',
        };
      }

      const names = field ? [field] : Object.keys(current.parsed.fields);
      return {
        target,
        version: current.version,
        written_at: current.createdAt,
        yaml: current.yaml,
        governed_fields: names.map((f) => ({
          field: f,
          mentioned_in_contract: f in current.parsed.fields,
          ...thresholdsFor(current.parsed, f),
        })),
        defaults: DEFAULT_THRESHOLDS,
      };
    },
  },

  assay_contract_history: {
    description:
      'Every version of a target contract, newest first, with the YAML as written. '
      + 'Versions are appended and never edited, so this answers "what did the '
      + 'contract say when that cell was published".',
    schema: { target: z.string().describe('Target id.') },
    async run({ target }: { target: string }) {
      const all = await contractHistory(target);
      return {
        target,
        versions: all.map((v) => ({
          version: v.version,
          written_at: v.createdAt,
          yaml: v.yaml,
          fields: Object.keys(v.parsed.fields),
        })),
      };
    },
  },
};
