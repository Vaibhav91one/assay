// Starting a watch, over MCP.
//
// `assay_watch` in core.ts drafts a contract and deliberately does not write
// one: "policy belongs in a reviewed change". That left an external agent -- the
// Claude Code / Codex surface in docs/STACK.md -- able to describe a scraper and
// unable to build one, which is a dead end rather than a safeguard. The review
// it was waiting for is the human at the other end of the MCP client.
//
// The name is `assay_create_watch`, not `assay_watch`, because they are two
// different acts and a model choosing between them should not have to infer
// which one writes.
//
// WHAT THIS TOOL STILL CANNOT DO. It creates a target and establishes a
// baseline. It cannot settle a held cell, and there is no argument to it that
// leads there: `assay_resolve` does not exist, `src/mcp/server.ts` refuses to
// start if any module exports that name, and nothing here routes around that.
// Creating a scraper before anything has been scraped is the one place
// docs/AI-AND-AGENTS.md 4 grants an agent real autonomy, and it grants it
// precisely because being wrong is cheap and reversible -- a target with no
// history deletes cleanly, and one with history pauses.

import { z } from 'zod';
import type { McpTool } from '../server.js';
import {
  createTarget, listTargets, pauseTarget, deleteTarget,
} from '../../setup/index.js';

export const TOOLS: Record<string, McpTool> = {
  assay_create_watch: {
    description:
      'Actually start watching a page: writes the target and establishes its '
      + 'baseline through the same pipeline the worker uses. Unlike assay_watch, '
      + 'which only drafts a contract, this one takes effect. A resolver pattern '
      + 'is a STRING, never a /regex/ literal.',
    schema: {
      url: z.string().describe('The page to watch.'),
      field: z.string().describe('snake_case name for the field, e.g. recall_title.'),
      tags: z.string().describe('CSS selector the field lives at, e.g. "h2,h3" or p.hazard.'),
      min_len: z.number().int().min(0).optional().describe('Shortest plausible text. Default 1.'),
      max_len: z.number().int().min(1).optional().describe('Longest plausible text. Default 400.'),
      include: z.string().optional().describe('Text that must appear. A string, not a regex literal.'),
      exclude: z.string().optional().describe('Text that disqualifies a match.'),
      cadence: z.string().optional().describe('hourly | daily | weekly | 6h | 2d. Default 6h.'),
      id: z.string().optional().describe('Override the id derived from the url.'),
    },
    async run(a: {
      url: string; field: string; tags: string;
      min_len?: number; max_len?: number; include?: string; exclude?: string;
      cadence?: string; id?: string;
    }) {
      // Zod validates at the boundary in src/setup, once. A refusal comes back
      // as a shaped result rather than a throw, so the agent reads why.
      return createTarget({
        url: a.url,
        cadence: a.cadence ?? '6h',
        ...(a.id ? { id: a.id } : {}),
        fields: [{
          name: a.field,
          resolver: {
            tags: a.tags,
            minLen: a.min_len ?? 1,
            maxLen: a.max_len ?? 400,
            ...(a.include ? { include: a.include } : {}),
            ...(a.exclude ? { exclude: a.exclude } : {}),
            flags: 'i',
          },
        }],
      });
    },
  },

  assay_targets: {
    description: 'Every page under watch, with its cadence, next run, and held count.',
    schema: {},
    async run() {
      return listTargets();
    },
  },

  assay_pause_watch: {
    description:
      'Stop running a target without forgetting it. Keeps the cadence and the '
      + 'whole history, and is reversible.',
    schema: { target: z.string().describe('The target id from assay_targets.') },
    async run({ target }: { target: string }) {
      return pauseTarget(target);
    },
  },

  assay_delete_watch: {
    description:
      'Forget a target that never ran. A target WITH history is refused, because '
      + 'deleting its runs would break the proof id on every row already '
      + 'published from it -- pause that one instead.',
    schema: { target: z.string().describe('The target id from assay_targets.') },
    async run({ target }: { target: string }) {
      return deleteTarget(target);
    },
  },
};
