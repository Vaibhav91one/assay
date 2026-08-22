// Which keys a local instance may want, and whether each one is there.
//
// PRESENCE ONLY. Nothing here returns, logs or interpolates a key's value --
// `KeyPresence` has nowhere to put one. That is the same rule the connector
// panel already holds to (`src/connectors/config.ts`: "the read path reports
// PRESENCE and nothing else -- no value, no prefix, no masked tail"), and
// docs/APP-DESIGN.md 6b states it for keys specifically: "the key is the
// user's own, shown by presence only."
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

/** One key, and whether the environment has it. No slot for a value. */
export interface KeyPresence {
  /** The variable, spelled exactly as `.env.example` spells it. */
  name: string;
  /** What setting it buys. One line. */
  buys: string;
  set: boolean;
}

// Names are `.env.example`'s, verbatim. The other variables in that file --
// DATABASE_URL, ASSAY_CAPTURES, AUTH_MODE, CLERK_* -- are not credentials this
// screen can help with: two are already true if this page rendered at all, and
// the auth pair chooses which panel you are looking at.
const KEYS: readonly (readonly [string, string])[] = [
  ['ANTHROPIC_API_KEY', 'Field discovery and second-opinion checks.'],
  ['BRIGHT_DATA_TOKEN', 'Fetches pages that refuse a plain request.'],
  ['RESEND_API_KEY', 'Sends the break alert and the digest.'],
];

/** Presence for every key. Booleans, never values. */
export const readKeys = (): KeyPresence[] =>
  KEYS.map(([name, buys]) => ({ name, buys, set: Boolean(process.env[name]) }));

/**
 * The lines to paste into `.env`, for the keys that are not set yet.
 *
 * Deliberately built from `name` alone: there is no branch here that could
 * ever reach a value, so the copyable block cannot leak one either. Empty
 * string when everything is set -- there is nothing to paste.
 */
export const envLines = (keys: readonly KeyPresence[]): string =>
  keys.filter((k) => !k.set).map((k) => `${k.name}=`).join('\n');
