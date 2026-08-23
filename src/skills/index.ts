// The page-source registry: every way this build can turn a url into bytes.
//
// WHAT THIS WAS, AND WHAT IS LEFT OF IT. This file used to be a catalogue of
// third-party "skills" -- including four real skills.sh entries that Assay
// deliberately cannot run -- because there was a screen whose whole argument
// was showing an operator what a skill DEMANDS before they grant it. That
// screen is gone (superseded by `/library`), and a catalogue with nothing
// rendering it is not a catalogue, it is dead data. So the four inert entries
// went with it, and with them the three fields that existed only to render
// them: `inert`, `demands`, `origin`.
//
// WHAT DOES NOT CHANGE is the rule those entries were evidence for: this file
// loads no instructions and executes nothing. A skill is third-party prose that
// lands in the same context window as scraped page content, and `src/agent/`
// withholds Bash, Write and Edit from the model that reads both. The registry
// below is DATA about hosts and variable names, and there is still nowhere in
// it to put an instruction.
//
// THE MODULE NAME IS NOW WRONG, and knowingly so. "skills" is really "the page
// fetcher and the sources it may fall back to": `./page.ts` is the single
// guarded fetcher every url in the product goes through. Renaming the directory
// would touch every importer -- the worker, setup, the agent, the library, the
// chat, two test files -- and that is not a change to make the evening before a
// submission. It is recorded here as the rename to do next.
//
// WHY BRIGHT DATA IS NOT HERE. It was, with `provides: 'delivery'`, and it was
// the second place in this repository claiming to know Bright Data's state. It
// named a variable (`BRIGHT_DATA_TOKEN`) that nothing has ever read, and it
// carried its own enable flag in `./store.ts` while the real configuration
// lives in `src/connectors/config.ts`. Two registries, two variable names and
// two enable stores for one credential is exactly how a screen ends up telling
// an operator that a connector they are using is not connected. Bright Data has
// one owner now, and it is `src/connectors/`.
//
// WHAT IS ACTUALLY WIRED reaches `fetchHtml` in `./page.js`, which reaches
// `runTarget`'s `fetchPage` parameter -- the seam `src/runner.ts` already has,
// and the reason a Bright Data delivery and a local fetch go down identical
// code. A source that plugs in there inherits the gate, the thresholds and the
// measured wrong-value rate unchanged.
//
// CREDENTIALS ARE PRESENCE ONLY. `needs` holds VARIABLE NAMES, spelled the way
// the code that reads them spells them. Nothing in this module returns, logs or
// interpolates a value -- `SkillState` has nowhere to put one, exactly as
// `web/app/sign-in/keys.ts` and `src/connectors/config.ts` already require.

/** One way to read a page, and what it wants before it can. */
export interface Skill {
  id: string;
  name: string;
  /** One line the operator reads first. */
  summary: string;
  /**
   * Credentials declared, by NAME. Empty means it needs none.
   *
   * Spelled as the code that reads them spells them; `stateOf` checks these
   * keys against an environment and reports which are absent.
   */
  needs: readonly string[];
  /** Hosts it will reach when it runs. Empty means it makes no outbound call. */
  hosts: readonly string[];
  /**
   * On always, and not the operator's to turn off.
   *
   * True for exactly one row: the direct fetch Assay has always done. It is
   * listed rather than hidden because a list of ways to read a page that
   * omitted the one in use would be a strange list -- but an operator who
   * could switch it off would be an operator who could stop Assay reading
   * anything, so it is not offered as a choice.
   */
  always: boolean;
}

/** Every page source this build knows about, in the order they are tried. */
export const SKILLS: readonly Skill[] = [
  {
    id: 'local-fetch',
    name: 'Direct fetch',
    summary: 'Reads a page with an ordinary HTTP request from this machine.',
    needs: [],
    hosts: [],
    always: true,
  },
  {
    id: 'firecrawl',
    name: 'Firecrawl',
    summary: 'Fetches a page through Firecrawl when a direct request is refused.',
    needs: ['FIRECRAWL_API_KEY'],
    hosts: ['api.firecrawl.dev'],
    always: false,
  },
];

export const skillById = (id: string): Skill | undefined => SKILLS.find((s) => s.id === id);

/** A source, plus what is true about it on this machine. Never holds a value. */
export interface SkillState extends Skill {
  /** The operator said yes to this one. Enabling alone does not make it work. */
  enabled: boolean;
  /** Every variable in `needs` is present in this process's environment. */
  satisfied: boolean;
  /** Which of them are not. Names only. */
  missing: readonly string[];
  /**
   * It will actually be used on the next run.
   *
   * Both have to hold, and they fail for different reasons, so the caller gets
   * both rather than one boolean it would have to explain.
   */
  active: boolean;
}

/**
 * Presence for one source.
 *
 * `env` is a parameter so a test can state the environment it is describing
 * rather than mutating the process's. It reads keys and compares to undefined;
 * there is no path here that returns what it read.
 */
export function stateOf(
  skill: Skill,
  enabled: readonly string[],
  env: Record<string, string | undefined> = process.env,
): SkillState {
  const missing = skill.needs.filter((v) => !env[v]);
  // `always` is on regardless of the store, and the store never holds it --
  // see `./store.ts`. Reading it from the file would make "Assay can read a
  // page" a thing an empty or deleted file could switch off.
  const on = skill.always || enabled.includes(skill.id);
  const satisfied = missing.length === 0;
  return { ...skill, enabled: on, satisfied, missing, active: on && satisfied };
}

/** Presence for every source, in registry order. */
export const statesOf = (
  enabled: readonly string[],
  env: Record<string, string | undefined> = process.env,
): SkillState[] => SKILLS.map((s) => stateOf(s, enabled, env));
