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
 * All three now have a section of their own. Slack and Discord used to point at
 * `#email-delivery`, on the reasoning that the true nearest thing beat a fake
 * anchor -- which was right about the anchor and wrong about the destination.
 * The paragraph it landed on describes `ASSAY_WEBHOOK_URL`, a signed
 * `{event, data, sent_at}` envelope that a Slack incoming webhook answers with
 * `invalid_payload`. An operator who followed that button got a working link to
 * a mechanism that cannot do what they came to do, which is worse than a button
 * that scrolls nowhere: it costs them the afternoon before they find out.
 *
 * `#slack` and `#discord` are real headings now, and they document the actual
 * credential -- an incoming-webhook URL in the connectors file, not a variable
 * in `.env`.
 *
 * `Record<Kind, string>` rather than a lookup with a fallback: a connector
 * added to `KINDS` and not to this map should fail the build, not ship a row
 * whose button has no href.
 */
export const CONNECTOR_DOC: Record<Kind, string> = {
  brightdata: '/docs/credentials#bright-data',
  slack: '/docs/credentials#slack',
  discord: '/docs/credentials#discord',
};

/**
 * What each connector kind is CALLED, as its vendor spells it.
 *
 * `Kind` is a stored token -- `brightdata`, `slack`, `discord` -- and the
 * Connections tab was printing it straight into a row label, so the screen said
 * "brightdata · API token" and "slack" beside prose that said "Bright Data" and
 * "Slack" two columns over. The token is not the name.
 *
 * It lives here rather than in `web/lib/copy.ts` for the reason `CONNECTOR_DOC`
 * does: `Record<Kind, string>` makes a connector added to `KINDS` and not to
 * this map a build failure, which a flat string catalogue cannot express.
 */
export const CONNECTOR_NAME: Record<Kind, string> = {
  brightdata: 'Bright Data',
  slack: 'Slack',
  discord: 'Discord',
};
