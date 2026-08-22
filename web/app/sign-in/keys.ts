// Which capabilities a local instance may want, and whether each one is
// satisfied.
//
// PRESENCE ONLY. Nothing here returns, logs or interpolates a key's value --
// `KeyPresence` has nowhere to put one. Every string it carries is a literal
// written in this file; none is derived from the environment. That is the same
// rule the connector panel already holds to (`src/connectors/config.ts`: "the
// read path reports PRESENCE and nothing else -- no value, no prefix, no
// masked tail"), and docs/APP-DESIGN.md 6b states it for keys specifically:
// "the key is the user's own, shown by presence only."
//
// WHY THIS READS THE ENVIRONMENT RATHER THAN A FORM. These keys are read from
// `process.env` by the code that uses them -- `src/ai/model.ts` reads
// ANTHROPIC_API_KEY, and it runs in the *worker*, which CONTRIBUTING.md
// describes as a second process beside Next. A browser cannot write another
// process's environment, so a form here could only ever have set a value in
// Next's own memory: gone on restart, and never visible to the process that
// actually needs it. A screen that appeared to save a credential it did not
// save is worse than one that says where the credential goes. So this panel
// does what the voice bank already promised for Resend -- "put it in the
// environment and this panel just reports that it is there."
//
// WHY CAPABILITIES RATHER THAN VARIABLES, CHANGED 2026-08-22. This file used to
// report one row per variable in `.env.example`, and that contract produced a
// screen that was true line by line and misleading as a whole: on a machine
// where the operator has run `claude setup-token`, Settings says "Connected
// through Claude Code on this machine" while this panel said
// `CLAUDE_CODE_OAUTH_TOKEN -- NOT SET`. Both statements are literally correct.
// Together they tell the operator to go and fix something that is not broken.
//
// The fix is to report what `src/ai/model.ts` actually gates on. `modelAuth()`
// answers with one of four words, and three of them mean "there is a model" --
// an API key, a subscription token, or the CLI's own login, which the Agent SDK
// falls back to without Assay ever opening the credential store. So the model
// row is satisfied when `modelAuth() !== 'none'`, and it names the route.
//
// The two model variables therefore collapse into ONE row. Two rows for one
// capability reproduces the exact bug above one level down: the moment the CLI
// login satisfies the model path, a two-row panel shows one row green and one
// row still asking for a credential nothing needs. They were never two
// capabilities -- `.env.example` already says "Either one satisfies the model
// path" -- so they are no longer two rows.
//
// BRIGHTDATA_API_TOKEN and ASSAY_RESEND_KEY have no alternative route. For
// those, satisfied still means the variable is set, and the row is unchanged in
// substance.
//
// THE NAMES, CORRECTED 2026-08-22. This panel used to check BRIGHT_DATA_TOKEN
// and RESEND_API_KEY, which are the names `.env.example` used to declare and
// the names nothing else in the repository has ever read. `tools/bd-heal.ts`
// and `tools/bd-status.sh` read BRIGHTDATA_API_TOKEN; `src/notify.ts` reads
// ASSAY_RESEND_KEY and throws by that name. So the panel reported a token as
// present while the tool that needs it saw nothing, and reported mail as
// configured while every alert went undelivered. The working code kept its
// names and everything else moved to meet it; `test/env-names.test.ts` now
// fails if the two sides drift apart again.

/**
 * Which credential the model path has, restated rather than imported.
 *
 * `src/ai/model.ts` owns this type, and importing it here would drag the Agent
 * SDK and Node built-ins into every module that wants to know what a row looks
 * like -- including the root vitest run, which has no business spawning
 * `claude`. The caller reads `modelAuth()` and passes the word in; this file
 * stays a pure function of its arguments and of `process.env`.
 */
export type ModelAuth = 'api-key' | 'subscription' | 'cli' | 'none';

/** One capability, and whether this machine has it. No slot for a value. */
export interface KeyPresence {
  /** The capability, named the way the operator would name it. */
  name: string;
  /** What having it buys. One line. */
  buys: string;
  /**
   * The variable(s) that satisfy it, spelled exactly as `.env.example` spells
   * them. Shown when the capability is unsatisfied; this is the contract with
   * the operator's shell, and it is what the removed paste block used to carry.
   */
  vars: readonly string[];
  /** Satisfied -- by any route this capability has, not only by a variable. */
  set: boolean;
  /**
   * Which route satisfied it. A literal from the tables below, chosen by a
   * word, never built from a value. Empty when nothing satisfied it.
   */
  via: string;
  /** The section of the documentation that explains this one. */
  doc: string;
}

/**
 * How each model route is said, matching `web/components/model-access.tsx`.
 *
 * The two screens report the same fact, so they say it the same way. A machine
 * whose CLI is signed in reads "through Claude Code signed in on this machine"
 * here and "Connected through Claude Code on this machine" there, and an
 * operator moving between them is never asked to reconcile two vocabularies.
 */
const MODEL_ROUTE: Record<Exclude<ModelAuth, 'none'>, string> = {
  'api-key': 'with an API key set in this process’s environment',
  subscription: 'with a Claude subscription token set in this process’s environment',
  cli: 'through Claude Code signed in on this machine',
};

/**
 * Presence for every capability. Booleans and fixed strings, never values.
 *
 * `auth` is passed in rather than read here because reading it costs seconds:
 * when neither model variable is set, `modelAuth()` shells out to `claude auth
 * status`, measured at 2.9-4.8s cold in `src/ai/model.ts`. The panel resolves
 * that behind a Suspense boundary so the rest of the screen paints first, and
 * that is only possible if this function does not do it.
 */
export const readKeys = (auth: ModelAuth): KeyPresence[] => [
  {
    name: 'Model access',
    // docs/APP-DESIGN.md 7.2, and `.env.example`: the optionality is the point.
    buys: 'Field discovery and second-opinion checks. Assay runs without one.',
    vars: ['ANTHROPIC_API_KEY', 'CLAUDE_CODE_OAUTH_TOKEN'],
    set: auth !== 'none',
    via: auth === 'none' ? '' : MODEL_ROUTE[auth],
    doc: '/docs/credentials#model-access',
  },
  {
    name: 'Bright Data',
    buys: 'Fetches pages that refuse a plain request.',
    vars: ['BRIGHTDATA_API_TOKEN'],
    set: Boolean(process.env.BRIGHTDATA_API_TOKEN),
    via: process.env.BRIGHTDATA_API_TOKEN ? 'with a token set in this process’s environment' : '',
    doc: '/docs/credentials#bright-data',
  },
  {
    name: 'Firecrawl',
    // Optional in a stronger sense than the others, and the row says so:
    // `src/skills/page.ts` is reached only after a direct fetch is refused, so
    // an instance without the key loses nothing on pages that already work. A
    // row that read "Reads pages" would make an operator go and find a key for
    // a capability they may never need.
    buys: 'Reads a page that refuses a direct request. Only tried after one is.',
    vars: ['FIRECRAWL_API_KEY'],
    set: Boolean(process.env.FIRECRAWL_API_KEY),
    via: process.env.FIRECRAWL_API_KEY ? 'with a key set in this process’s environment' : '',
    doc: '/docs/credentials#firecrawl',
  },
  {
    name: 'Email delivery',
    buys: 'Sends the break alert and the digest.',
    vars: ['ASSAY_RESEND_KEY'],
    set: Boolean(process.env.ASSAY_RESEND_KEY),
    via: process.env.ASSAY_RESEND_KEY ? 'with a key set in this process’s environment' : '',
    doc: '/docs/credentials#email-delivery',
  },
];
