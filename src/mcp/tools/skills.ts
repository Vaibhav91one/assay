// How Assay reads a page, over MCP: which sources exist and which one will run.
//
// READ ONLY, and there is deliberately no `assay_skill_enable`. Enabling a
// source is a grant -- a host to reach, a credential to read -- and an agent
// driven over untrusted page text is the last principal that should be able to
// make one. Consent is the operator's, recorded in `src/skills/store.ts`, which
// has no writer at all. This tool exists so an agent can ANSWER "why can't
// Assay read this page?" without being able to change the answer, which is the
// same shape `assay_connectors` already has.
//
// PRESENCE ONLY. `statesOf` returns booleans, variable names and strings written
// in the registry. It has nowhere to put a credential's value, so neither does
// this.
//
// MCP IS ALSO THE ANSWER TO "BRING YOUR OWN". A third-party skill is third-party
// instructions read by the same model that reads scraped pages; a third-party
// MCP server is a separate process, holding its own credentials, that Assay
// speaks a typed protocol to. Assay is already an MCP server -- this file is one
// more module in a directory the server globs -- and that is the extension point
// that does not require handing anything the ability to act.

import { statesOf } from '../../skills/index.js';
import { enabled } from '../../skills/store.js';
import type { McpTool } from '../server.js';

export const TOOLS: Record<string, McpTool> = {
  assay_skills: {
    description:
      'Every way Assay can turn a URL into bytes: which are in use and which are off. ' +
      'Reports the environment variables each one declares by NAME and whether they ' +
      'are set, never what they are set to. Bright Data is not here -- it delivers TO ' +
      'Assay rather than being fetched from; ask assay_connectors.',
    schema: {},
    async run() {
      const skills = statesOf(await enabled());
      const fallbacks = skills.filter((s) => s.active && !s.always);
      return {
        sources: skills.map((s) => ({
          id: s.id,
          name: s.name,
          summary: s.summary,
          enabled: s.enabled,
          active: s.active,
          needs: s.needs,
          missing: s.missing,
          hosts: s.hosts,
        })),
        // Assay's own words, so an agent reads the product's vocabulary rather
        // than inventing a status of its own.
        reading: `A page is read with a direct request first. ${
          fallbacks.length
            ? `If that is refused, ${fallbacks.map((s) => s.name).join(' then ')} is tried.`
            : 'If that is refused, the run fails -- no other source is enabled.'
        }`,
        enabling:
          'Enabling is the operator’s: an id in the file at ASSAY_SKILLS (default ' +
          'data/skills.json), plus the credential in the environment of the process ' +
          'making the request. There is no tool here that grants one.',
      };
    },
  },
};
