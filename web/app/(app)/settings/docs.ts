// Which page explains which connection on the Connections tab.
//
// A .ts beside `doc-link.tsx` rather than inside it, for the reason
// `test/signin-keys.test.ts` gives for asserting `keys.ts` and not the panel
// that renders it: the root vitest run is node-side and has no business
// transforming JSX, and these hrefs are exactly the kind of claim that rots
// silently -- the documentation gets reorganised, the heading is renamed, and
// the button still looks like a button while scrolling nowhere.
// `test/settings-docs.test.ts` reads the .mdx and checks the anchors are real.

import type { Kind } from 'assay/engine/connectors/config';

/** The section explaining the model path. The href `web/app/sign-in/keys.ts` uses. */
export const MODEL_DOC = '/docs/credentials#model-access';

/**
 * Where each connector is explained.
 *
 * Bright Data has its own section. Slack and Discord do not: nothing under
 * `web/content/docs/` names either of them, and inventing `#slack` would be a
 * button that scrolls nowhere. What they actually are is the non-email path a
 * break alert takes, and that is the one paragraph in `#email-delivery` --
 * "if you are alerting to something other than email, the worker also reads
 * ASSAY_WEBHOOK_URL". So they point at the true nearest thing rather than at a
 * heading that does not exist. That is a documentation gap, recorded here, and
 * it is not a reason to fake a link.
 *
 * `Record<Kind, string>` rather than a lookup with a fallback: a connector
 * added to `KINDS` and not to this map should fail the build, not ship a row
 * whose button has no href.
 */
export const CONNECTOR_DOC: Record<Kind, string> = {
  brightdata: '/docs/credentials#bright-data',
  slack: '/docs/credentials#email-delivery',
  discord: '/docs/credentials#email-delivery',
};
