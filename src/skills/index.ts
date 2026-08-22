// The skill registry: what a third-party capability DECLARES it needs, as data.
//
// WHY A REGISTRY AND NOT A LOADER. The obvious reading of "add skill support"
// is: discover SKILL.md files, feed them to the model, let them work. That
// reading does not survive contact with this codebase, and the research is not
// close. Two facts decide it.
//
//   1. The scraping skills people actually publish are shell wrappers. Of the
//      ones examined on skills.sh, `firecrawl-scrape` declares
//      `allowed-tools: Bash(firecrawl *)`, `just-scrape` declares an
//      unrestricted `allowed-tools: Bash` and self-installs itself with
//      `npm install -g`, and zytedata's `scrape-explore-site` runs five Python
//      files through `uv`. `src/agent/index.ts` withholds Bash, Write and Edit
//      -- so every one of them is INERT here. Not degraded: inert. They are
//      documentation for a terminal this agent does not have.
//
//   2. A skill is third-party INSTRUCTIONS, and they land in the same context
//      window as scraped page content. Snyk's ToxicSkills study of 3,984 skills
//      from ClawHub and skills.sh (corpus as of 2026-02-05) found 13.4% carrying
//      a critical-severity issue and 76 confirmed malicious payloads, 91% of
//      which worked by prompt injection. Datadog Security Labs (2026-05-11)
//      documented Claude Code's dynamic-context syntax executing shell at
//      SKILL-LOAD time -- "before Claude sees anything" -- which no model-level
//      defence can intervene in.
//
// So this file loads no instructions and executes nothing. It is a table of
// what each capability DEMANDS, which is the one thing skills.sh does not show
// you: its required frontmatter is `name` and `description`, both free text,
// and the site renders install counts and stars but never `allowed-tools` and
// never the environment variables a skill will reach for. An operator there
// cannot see what they are about to grant. Here they can, before they enable it.
//
// WHAT IS ACTUALLY WIRED runs through `provides`. A `page-source` entry supplies
// bytes to `fetchHtml` in `./page.js`, which reaches `runTarget`'s `fetchPage`
// parameter -- the seam `src/runner.ts` already has, and the reason a Bright
// Data delivery and a local fetch go down identical code. A source that plugs in
// there inherits the gate, the thresholds and the measured wrong-value rate
// unchanged. An entry with `provides: null` carries `inert` instead, a sentence
// saying why, and the screen prints that rather than an enable button that lies.
//
// CREDENTIALS ARE PRESENCE ONLY. `needs` holds VARIABLE NAMES, spelled the way
// the code that reads them spells them. Nothing in this module returns, logs or
// interpolates a value -- `SkillState` has nowhere to put one, exactly as
// `web/app/sign-in/keys.ts` and `src/connectors/config.ts` already require.

/** One credential a skill declares. A name and where to read about it. */
export interface Need {
  /** Spelled as the code that reads it spells it. `satisfied` checks this key. */
  var: string;
  /** One line: what setting it buys. */
  why: string;
  /** The documentation section that explains this one. */
  doc: string;
}

/**
 * What a capability is, and what it wants.
 *
 * `demands` is the host-agent tools the skill needs to do its stated job, read
 * off its own published frontmatter. It is recorded for entries Assay cannot
 * run precisely so the screen can say WHY -- "it wants Bash and this agent has
 * none" is a better answer than a greyed-out button.
 */
export interface Skill {
  id: string;
  name: string;
  /** One line the operator reads first. */
  summary: string;
  /** Where the entry came from, and where its source can be read. */
  origin: { registry: 'assay' | 'skills.sh'; url: string | null };
  /** Credentials declared. Empty means it needs none. */
  needs: readonly Need[];
  /** Hosts it will reach when it runs. Empty means it makes no request. */
  hosts: readonly string[];
  /** Tools it demands of the host agent. Empty means instructions only. */
  demands: readonly string[];
  /**
   * What Assay can do with it.
   *
   *   `page-source` -- supplies bytes to `fetchHtml`, so it reaches the gate.
   *   `delivery`    -- pushes a page to Assay rather than being pulled from.
   *   null          -- nothing; `inert` says why, and the screen prints it.
   */
  provides: 'page-source' | 'delivery' | null;
  /** Why this cannot run here. Null exactly when `provides` is non-null. */
  inert: string | null;
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

/**
 * Every capability this build knows about. Real entries only.
 *
 * The four skills.sh rows are here BECAUSE they cannot run, not despite it.
 * The owner's question was whether skills belong in Assay; a list that quietly
 * omitted every skill that does not fit would answer it by hiding the evidence.
 * Each one records what it actually declares -- read from its published
 * SKILL.md, not from memory -- so the screen can show an operator the shape of
 * the whole category in one place.
 */
export const SKILLS: readonly Skill[] = [
  {
    id: 'local-fetch',
    name: 'Direct fetch',
    summary: 'Reads a page with an ordinary HTTP request from this machine.',
    origin: { registry: 'assay', url: null },
    needs: [],
    hosts: [],
    demands: [],
    provides: 'page-source',
    inert: null,
    always: true,
  },
  {
    id: 'firecrawl',
    name: 'Firecrawl',
    summary: 'Fetches a page through Firecrawl when a direct request is refused.',
    origin: { registry: 'assay', url: 'https://docs.firecrawl.dev/api-reference/endpoint/scrape' },
    needs: [{
      var: 'FIRECRAWL_API_KEY',
      why: 'Authorises the scrape. Your own key -- Assay never ships one.',
      doc: '/docs/credentials#firecrawl',
    }],
    hosts: ['api.firecrawl.dev'],
    demands: [],
    provides: 'page-source',
    inert: null,
    always: false,
  },
  {
    id: 'brightdata',
    name: 'Bright Data',
    summary: 'Delivers a scraped page to Assay by webhook, rather than being fetched from.',
    origin: { registry: 'assay', url: null },
    needs: [{
      var: 'BRIGHT_DATA_TOKEN',
      why: 'Fetches pages that refuse a plain request.',
      doc: '/docs/credentials#bright-data',
    }],
    hosts: [],
    demands: [],
    // Not a page source: Assay does not pull from Bright Data, Bright Data
    // POSTs to `/api/v1/connectors/brightdata/delivery/:target`. Configured on
    // the connectors surface, which already exists, so this row is here to be
    // seen beside the others and deliberately has no second enable path.
    provides: 'delivery',
    inert: null,
    always: false,
  },
  {
    id: 'firecrawl-scrape',
    name: 'firecrawl-scrape',
    summary: 'Tells an agent how to drive the Firecrawl CLI from a terminal.',
    origin: { registry: 'skills.sh', url: 'https://www.skills.sh/firecrawl/cli/firecrawl-scrape' },
    needs: [],
    hosts: [],
    demands: ['Bash(firecrawl *)'],
    provides: null,
    inert: 'Every instruction in it is a shell command, and it finishes by writing '
      + 'a file. Assay’s agent has no Bash and no Write, so there is nothing here '
      + 'for it to run. Firecrawl itself is wired — see the Firecrawl entry above.',
    always: false,
  },
  {
    id: 'just-scrape',
    name: 'just-scrape',
    summary: 'Tells an agent how to drive the ScrapeGraphAI CLI from a terminal.',
    origin: { registry: 'skills.sh', url: 'https://www.skills.sh/scrapegraphai/just-scrape/just-scrape' },
    needs: [{
      var: 'SGAI_API_KEY',
      why: 'The skill’s own credential. Assay does not read this variable.',
      doc: '/docs/credentials#skills-assay-cannot-run',
    }],
    hosts: [],
    demands: ['Bash'],
    provides: null,
    inert: 'It declares unrestricted Bash and its first step installs itself with '
      + '`npm install -g`. Assay’s agent has no shell to run either in, and '
      + 'granting one to the model that reads scraped pages is the thing this '
      + 'product refuses.',
    always: false,
  },
  {
    id: 'firecrawl-build-scrape',
    name: 'firecrawl-build-scrape',
    summary: 'Guidance for writing Firecrawl calls into your own codebase.',
    origin: { registry: 'skills.sh', url: 'https://github.com/firecrawl/skills' },
    needs: [{
      var: 'FIRECRAWL_API_KEY',
      why: 'Declared by the skill for the application it helps you write.',
      doc: '/docs/credentials#firecrawl',
    }],
    hosts: [],
    demands: [],
    provides: null,
    // The honest one. It demands no tools and is a real knowledge source -- but
    // its job is editing a codebase, and Assay has no codebase to hand it.
    // Its `inputs:` block is also the closest thing the ecosystem has to a
    // machine-readable credential declaration, and is where `needs` above
    // came from as an idea.
    inert: 'It is advice for writing integration code, and its stated job is to edit '
      + 'a codebase. Assay has no codebase to point it at. Its declared inputs are '
      + 'recorded here because that declaration is the pattern this registry copied.',
    always: false,
  },
  {
    id: 'scrape-explore-site',
    name: 'scrape-explore-site',
    summary: 'Explores a site by running bundled Python scripts through uv.',
    origin: { registry: 'skills.sh', url: 'https://github.com/zytedata/skills' },
    needs: [],
    hosts: [],
    demands: ['Bash', 'Read', 'Write'],
    provides: null,
    inert: 'It ships five Python files and its method is running them. Assay’s agent '
      + 'has no Bash and no Write, and a sibling skill in the same repository starts '
      + 'a local HTTP server — which is the reason this registry records what a '
      + 'skill demands instead of loading it.',
    always: false,
  },
];

export const skillById = (id: string): Skill | undefined => SKILLS.find((s) => s.id === id);

/** A skill, plus what is true about it on this machine. Never holds a value. */
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
   * All three have to hold, and they fail for different reasons, so the screen
   * gets all three rather than one boolean it would have to explain.
   */
  active: boolean;
}

/**
 * Presence for one skill.
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
  const missing = skill.needs.map((n) => n.var).filter((v) => !env[v]);
  // `always` is on regardless of the store, and the store never holds it --
  // see `enable`. Reading it from the file would make "Assay can read a page"
  // a thing an empty or deleted file could switch off.
  const on = skill.always || enabled.includes(skill.id);
  const satisfied = missing.length === 0;
  return {
    ...skill,
    enabled: on,
    satisfied,
    missing,
    active: on && satisfied && skill.provides !== null,
  };
}

/** Presence for every skill, in registry order. */
export const statesOf = (
  enabled: readonly string[],
  env: Record<string, string | undefined> = process.env,
): SkillState[] => SKILLS.map((s) => stateOf(s, enabled, env));
