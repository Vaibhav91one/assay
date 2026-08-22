// The skill registry over MCP: what Assay can be given, and what each one wants.
//
// READ ONLY, and there is deliberately no `assay_skill_enable`. Enabling a
// capability is a grant -- a host to reach, a credential to read -- and an agent
// driven over untrusted page text is the last principal that should be able to
// make one. The operator confirms in the app, after a review that names the host
// and the variable; `web/app/(app)/skills/skills-list.tsx` is where that lives.
// This tool exists so an agent can ANSWER "why can't Assay read this page?"
// without being able to change the answer, which is the same shape
// `assay_connectors` already has.
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
      'Every capability Assay knows about: which are in use, which are off, and which ' +
      'cannot run here at all. Reports the environment variables each one declares by ' +
      'NAME and whether they are set, never what they are set to.',
    schema: {},
    async run() {
      const skills = statesOf(await enabled());
      const sources = skills.filter((s) => s.provides === 'page-source' && s.active);
      return {
        skills: skills.map((s) => ({
          id: s.id,
          name: s.name,
          summary: s.summary,
          from: s.origin.registry,
          provides: s.provides,
          enabled: s.enabled,
          active: s.active,
          needs: s.needs.map((n) => n.var),
          missing: s.missing,
          hosts: s.hosts,
          demands: s.demands,
          cannot_run_because: s.inert,
        })),
        // Assay's own words, so an agent reads the product's vocabulary rather
        // than inventing a status of its own.
        reading: `A page is read with a direct request first. ${
          sources.filter((s) => !s.always).length
            ? `If that is refused, ${sources.filter((s) => !s.always).map((s) => s.name).join(' then ')} is tried.`
            : 'If that is refused, the run fails -- no other source is enabled.'
        }`,
        enabling:
          'Enabling is the operator’s, in the app, after a review naming the host and the ' +
          'variable. There is no tool here that grants one.',
      };
    },
  },
};
