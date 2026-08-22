// Connector state over MCP: where Assay can speak, and whether it can speak
// at all.
//
// READ ONLY, and that is the whole design. There is no tool here that sets a
// credential and none that reads one back. A connector URL is a bearer token --
// anyone holding it can post as the workspace -- and a tool surface an agent
// drives over untrusted page text is the last place to put one.
//
// The agent's honest question is "if this breaks while nobody is watching, does
// anyone hear about it?", and presence answers that without handing over a key.

import { describe } from '../../connectors/config.js';
import type { McpTool } from '../server.js';

export const TOOLS: Record<string, McpTool> = {
  assay_connectors: {
    description:
      'Where Assay can announce a held field: Bright Data delivery, Slack, Discord. ' +
      'Reports whether each is configured, never what it is configured with.',
    schema: {},
    async run() {
      const present = await describe();
      const chat = present.filter((p) => p.kind !== 'brightdata' && p.configured);
      return {
        connectors: present,
        // Assay's own words, so an agent reads the product's vocabulary rather
        // than inventing a status of its own.
        announcements: chat.length
          ? `A held field is announced to ${chat.map((c) => c.kind).join(' and ')}.`
          : 'Nothing is configured to receive an announcement. A held field would be recorded and nobody would be told.',
        deliveries: present.find((p) => p.kind === 'brightdata')?.configured
          ? 'Bright Data deliveries are accepted, and are authenticated by the bearer Assay issued.'
          : 'Bright Data deliveries are refused: no connector is configured.',
      };
    },
  },
};
