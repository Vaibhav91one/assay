// The tracker library: what Assay guesses first, so a first-time operator has
// nothing to describe.
//
// THE COLD START. An empty Assay asks you to find a page and then say, in prose
// or in a form, what on it you want watched. That is a lot to ask of somebody
// who has not yet seen the product do anything. A tracker replaces it with a
// click: you pick "Price", you paste your own URL, Assay reads that page and
// proposes the fields, you approve, it is scheduled. Step four does not move.
//
// A TRACKER IS A PRIOR ON FIELD DISCOVERY, AND VERY LITTLE ELSE. Per field: a
// pattern describing what the value LOOKS like, a tier, and a sentence saying
// why that tier. `./analyse.ts` runs the patterns over `candidatesOn` and hands
// each hit to `resolverFor` -- the same derivation the manual path already uses,
// so a tracker-made proposal and a hand-typed one are the same object built by
// the same function. Nothing here has a privileged route into the store.
//
// NO MODEL. `converse` in `src/agent/index.ts` proposes fields with one and is
// optional by design; the product has to be whole with no key set. So a prior is
// DATA, and the same page yields the same proposal on any machine.
//
// FEATURES.md F7 SURVIVES. "No selector editing. Ever" is about the operator:
// there is no text box in this feature that a selector goes into and the
// operator never sees one. A prior describes the VALUE -- "a currency symbol
// followed by digits" -- not where it sits. Two priors carry a `tags` hint,
// which is a claim about what KIND of element holds that kind of value and is
// exactly what `RECALL_TITLE` in `src/target.ts` has always done.
//
// THE OPERATOR SUPPLIES THE URL. That is what keeps this out of terms-of-service
// territory: Assay ships no list of sites it scrapes. `examples` exist only so
// somebody with no page in mind can watch it work, every one of them was vetted
// against robots.txt and published terms on the date recorded, and `RULED_OUT`
// records what failed that vetting rather than dropping it silently.
//
// EVIDENCE IS PER FIELD AND ALMOST ENTIRELY ABSENT. `corpus/` holds three sites
// and the benchmark is 153 cases over ONE field on those three: `recall_title`,
// with the include pattern `src/target.ts` calls `RECALL_TITLE`. That field is
// in this file, with that pattern, so it is the one place a measured claim
// legitimately attaches -- and it is the only one. Every other field says so.
// docs/LIMITATIONS.md 5 is explicit that tau 0.60 and delta 0.16 are fitted to
// that corpus and there is no evidence they transfer.

// The ONLY import in this file, and it must stay that way. `../contracts/tiers.js`
// imports nothing at all -- that is the property it was split out of
// `../contracts/index.js` for. The library screens are client components that
// display a tier's numbers, so anything heavier reached from here lands in the
// browser bundle. `./analyse.ts` and `./contract.js` hold the parts that need
// cheerio and a YAML serialiser, and only the server imports those.
import { TIER_THRESHOLDS, type Tier } from '../contracts/tiers.js';

/**
 * How to recognise one kind of value on a page nobody has seen.
 *
 * Patterns are STRINGS, never RegExp literals, and never carry the `g` flag:
 * `test` on a global regex is stateful and these are reused across hundreds of
 * candidates. `test/library.test.ts` refuses one that sets it.
 */
export interface Prior {
  /** Must match the candidate's text. */
  pattern: string;
  /** Must NOT match. Where a pattern is right but has a known false friend. */
  avoid?: string;
  /**
   * If set, the element's tag must be one of these.
   *
   * A claim about what kind of element holds this kind of value, not about any
   * site's markup -- a service's overall verdict is a heading, its per-component
   * rows are not. Used by two priors and neither uses it for convenience.
   */
  tags?: string[];
  flags?: string;
  /** The band the value's text length falls in. Not decoration -- see below. */
  minLen: number;
  maxLen: number;
}

/** A number this repo can show its work for. */
export interface Measurement {
  /** What is true. */
  claim: string;
  /** How it was produced, so a reader can run it again. */
  method: string;
  /** Paths in this repository. Committed, so they can be opened. */
  source: string;
}

/** One value a tracker watches. */
export interface TrackerField {
  /** snake_case. Becomes a column name and a proof-record key -- see `FieldName`. */
  name: string;
  /** What this value is, in one line. */
  means: string;
  /** The tier, which is what fixes tau and delta. See `src/contracts/tiers.ts`. */
  policy: Tier;
  /** Why that tier and not another. */
  why: string;
  match: Prior;
  /**
   * A measured record for THIS field, or null.
   *
   * Null for all but one, and the screen prints the absence as a sentence in
   * the same box a claim would take: an absence has to read as deliberate.
   */
  evidence: Measurement | null;
}

/**
 * A page anyone can try this on, for an operator with no URL in mind.
 *
 * `permission` is quoted from robots.txt or from published terms that were
 * fetched on `checked`. It is printed on the screen: this repository is public
 * and MIT, and naming a URL without recording what was checked would make the
 * list an assertion instead of an argument.
 */
export interface Example {
  label: string;
  url: string;
  permission: string;
  /** ISO date robots.txt and the terms were fetched and read. */
  checked: string;
}

export interface Tracker {
  id: string;
  /** Which shelf it sits on. See `GROUPS`. */
  group: string;
  /** What it is called. Short -- the list is scanned, not read. */
  name: string;
  /** What you will be told. */
  summary: string;
  /** The kind of page it expects, so an operator can tell if theirs is one. */
  needs: string;
  /** What happens when the page is not that. */
  mismatch: string;
  /**
   * Must be one of `CADENCES` in `src/agent/models.ts` -- not merely something
   * `cadenceMs` can parse. `build` validates against that enum and the approval
   * form's select is built from it. `test/library.test.ts` checks membership.
   */
  cadence: string;
  fields: readonly TrackerField[];
  examples: readonly Example[];
}

// ---------------------------------------------------------------------------
// The one measured claim, and the one field it attaches to
// ---------------------------------------------------------------------------

/**
 * `recall_title`, and nothing else in this file.
 *
 * `tools/bench.ts` runs 153 mutation cases over six captures from `corpus/` and
 * `tools/replay.ts` runs 74 recorded runs across the same three sites -- all of
 * them this field, found by this pattern. That is why the claim attaches here
 * and would be a borrowed number anywhere else: the recall tracker's prior IS
 * `RECALL_TITLE` from `src/target.ts`, which is the contract the benchmark ran.
 *
 * The method names the threshold pair for the same reason. The gated arm ran at
 * tau 0.60 / delta 0.16; this field declares `normal`, which resolves to that
 * pair; and `test/library.test.ts` asserts the identity through `thresholdsFor`
 * on the field's own emitted contract. Without that assertion the sentence would
 * be a number from one experiment printed beside a configuration from elsewhere.
 *
 * What it still does NOT cover: any page outside those three sites. The claim
 * says so in its own last sentence rather than in a footnote somewhere else.
 */
const RECALL_TITLE_MEASURED: Measurement = {
  claim:
    '153 mutation cases over six captures from three real recall pages: the gate published '
    + '0 wrong values and abstained on 35.3%. Separately, 74 recorded runs across those sites '
    + 'healed 66 and abstained 0. Those three sites are the only pages this has been run '
    + 'against — it is not a claim about your page.',
  method:
    'npm run bench and npm run replay over corpus/ (ikea, mattel, chicco), gated arm at '
    + 'tau 0.60 / delta 0.16 — the pair the normal tier resolves to, asserted against this '
    + 'field’s own contract in test/library.test.ts. The prior below is RECALL_TITLE from '
    + 'src/target.ts, which is the contract those runs used.',
  source: 'results/bench.json, results/events.jsonl',
};

/**
 * The sentence every unmeasured field prints.
 *
 * One string, used everywhere, so an absence cannot be phrased more softly on
 * one screen than another.
 */
export const NOT_MEASURED =
  'Not measured. Assay’s published numbers come from one field on three recall sites, and '
  + 'this is not that field. The tier is a judgement about the value, not a number read off '
  + 'an experiment.';

// ---------------------------------------------------------------------------
// The trackers
// ---------------------------------------------------------------------------

/** The shelves, in the order they are shown. */
export const GROUPS = [
  { id: 'commerce', label: 'Commerce' },
  { id: 'software', label: 'Software' },
  { id: 'safety', label: 'Safety and recalls' },
  { id: 'infrastructure', label: 'Infrastructure' },
  { id: 'content', label: 'Documents' },
] as const;

/**
 * Every prior below was run against real fetched pages before it was written
 * down, and the pages are named in each tracker's `examples` or in the report
 * that shipped this. A prior that had not been run would be a guess with a
 * regex in it.
 */
export const TRACKERS: readonly Tracker[] = [
  {
    id: 'price',
    group: 'commerce',
    name: 'Price',
    summary: 'What one thing costs, and whether it can still be bought.',
    needs: 'A page about a single product, with the price written in the page as text.',
    mismatch:
      'Price and stock are the two values most often written in by script after the page '
      + 'loads. If yours are, Assay finds nothing and says so before anything is created — '
      + 'it does not create a watch on a field it could not read once.',
    cadence: '6h',
    fields: [
      {
        name: 'price',
        means: 'The price, as the page prints it.',
        policy: 'strict',
        why:
          'Money, and short. FEATURES.md F2 opens with this exact case — a price must never '
          + 'be wrong — and a product page is full of plausible wrong answers: struck-through '
          + 'originals, instalments, related items.',
        match: {
          // Currency-first or amount-then-code. Both forms appear on real pages
          // and neither subsumes the other.
          pattern: String.raw`(?:[$£€¥₹]\s*\d[\d.,]*)|(?:\b\d[\d.,]*\s?(?:USD|EUR|GBP|INR)\b)`,
          // A zero price is nearly always a tax line or a shipping line.
          // books.toscrape.com lists "Price (excl. tax) £51.77", "Price (incl.
          // tax) £51.77" and "Tax £0.00" in three identical cells, and without
          // this the tax won.
          avoid: String.raw`[$£€¥₹]\s*0(?:[.,]0+)?\s*$`,
          minLen: 2,
          maxLen: 40,
        },
        evidence: null,
      },
      {
        name: 'availability',
        means: 'Whether it is in stock.',
        policy: 'strict',
        why:
          'Two or three words, and the opposite answer is two or three words that look much '
          + 'the same to a text scorer. Being wrong here is being wrong about the only '
          + 'question the page was being watched for.',
        match: {
          // Bare "available" is not here on purpose: it matched "AVAILABLE
          // ADD-ONS" on GitHub, "now available on AI Gateway" on a changelog and
          // "Available-Dictionary" on MDN. Every alternative below carries stock
          // context of its own.
          pattern: String.raw`\b(?:in stock|out of stock|sold out|unavailable|back ?ordered?|pre-?order|discontinued|currently unavailable|ships? (?:in|within))\b`,
          minLen: 3,
          maxLen: 70,
        },
        evidence: null,
      },
    ],
    examples: [
      {
        label: 'books.toscrape.com — a sandbox published for scraping practice',
        url: 'http://books.toscrape.com/catalogue/a-light-in-the-attic_1000/index.html',
        permission:
          'A sandbox published expressly so people can practise scraping against it. The host '
          + 'serves no robots.txt at all (404), so nothing is disallowed.',
        checked: '2026-08-23',
      },
    ],
  },
  {
    id: 'release',
    group: 'software',
    name: 'Release',
    summary: 'The newest version of something you depend on, and when it shipped.',
    needs:
      'A releases or downloads page where the newest version and its date are written as text.',
    mismatch:
      'If the newest entry is behind a "load more" control, it is not in what a plain request '
      + 'returns and Assay finds nothing. Where a page carries no version at all — a changelog '
      + 'with titled entries and no numbers — this tracker reports that rather than inventing '
      + 'a field.',
    cadence: '12h',
    fields: [
      {
        name: 'version',
        means: 'The version identifier.',
        policy: 'strict',
        why:
          'A handful of characters, and every older release on the page is the same string '
          + 'with a different number in it. The near-identical-decoy case delta exists for.',
        match: {
          pattern: String.raw`\bv?\d+\.\d+(?:\.\d+)?(?:-[0-9A-Za-z.]+)?\b`,
          // Everything else on a page that is shaped like a version: prices,
          // percentages, file sizes, CSS units. Uptime figures on a status page
          // ("99.99 %") were the first false positive this caught.
          avoid: String.raw`[$£€¥₹]|\bUSD\b|\bEUR\b|\bGBP\b|%|\b(?:MB|KB|GB|TB|kB|ms|px|pt|em)\b`,
          minLen: 2,
          maxLen: 140,
        },
        evidence: null,
      },
      {
        name: 'released_on',
        means: 'The date beside it.',
        policy: 'strict',
        why: 'Short, and a release page is nothing but other dates.',
        match: {
          pattern: String.raw`\b\d{4}-\d{2}-\d{2}\b|\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4}\b|\b\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{4}\b`,
          minLen: 6,
          maxLen: 90,
        },
        evidence: null,
      },
    ],
    examples: [
      {
        label: 'github.com/nodejs/node/releases',
        url: 'https://github.com/nodejs/node/releases',
        permission:
          'GitHub’s Acceptable Use Policies name scraping and permit it: "You may use '
          + 'information from our Service … regardless of whether the information was scraped, '
          + 'collected through our API, or obtained otherwise". robots.txt disallows '
          + '/*/*/commits/, /*/*/tags and a dozen more for User-agent: *; /releases is not '
          + 'among them. Note /*.atom$ IS disallowed, so the feed is not an alternative here.',
        checked: '2026-08-23',
      },
    ],
  },
  {
    id: 'recall',
    group: 'safety',
    name: 'Recall or safety notice',
    summary: 'A new safety notice on a page you stock from.',
    needs:
      'A page listing notices with the newest first, each headed by a sentence naming the '
      + 'product and the hazard.',
    mismatch:
      'The prior looks for a heading that says a product is being recalled. On a page that is '
      + 'a single notice rather than a list, or one that words it differently, Assay reports '
      + 'that it found nothing rather than watching the nav link that says "Recalls".',
    cadence: 'daily',
    fields: [
      {
        name: 'recall_title',
        means: 'The headline of the newest notice.',
        policy: 'normal',
        why:
          'Long, distinctive, prose-like — the case the similarity scorer handles best, and '
          + 'the only case this project has actually measured. Left on the tier the evidence '
          + 'is for.',
        // This IS `RECALL_TITLE` from src/target.ts, which is the contract
        // `tools/bench.ts` and `tools/replay.ts` ran. The `avoid` list is that
        // file's `exclude` plus the two anchors a nav bar needs -- a site menu
        // reading "Home Shop Recalls Support About" matched before they existed.
        match: {
          pattern: String.raw`\brecalls?\b|\brappel\b|\bretirada\b|safety notice`,
          avoid: String.raw`recalls?\.gov|learn more|click here|^product recalls$|^recalls$`,
          tags: ['h1', 'h2', 'h3', 'a', 'li'],
          minLen: 25,
          maxLen: 160,
        },
        evidence: RECALL_TITLE_MEASURED,
      },
      {
        name: 'notice_date',
        means: 'When it was published.',
        policy: 'strict',
        why: 'A date on a page of other dates, answering "is this one new?".',
        match: {
          pattern: String.raw`\b\d{4}-\d{2}-\d{2}\b|\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4}\b|\b\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{4}\b`,
          minLen: 6,
          maxLen: 90,
        },
        evidence: null,
      },
    ],
    examples: [
      {
        label: 'The Assay testbed — a synthetic recall page this project operates',
        url: 'https://assay-testbed.vercel.app/recalls',
        permission:
          'This project’s own fixture. Contoso Home Goods is not a real retailer and none of '
          + 'the notices are real; the page exists so a scraper can be pointed at it and have '
          + 'the DOM changed underneath it on purpose.',
        checked: '2026-08-23',
      },
    ],
  },
  {
    id: 'status',
    group: 'infrastructure',
    name: 'Service status',
    summary: 'Whether something you depend on says it is up.',
    needs: 'A status page with one overall verdict written as a heading.',
    mismatch:
      'Some status pages render their verdict from a script after the page loads, and then '
      + 'there is nothing in the HTML to find. Assay says so rather than creating a watch that '
      + 'never resolves. Where a site publishes a JSON status endpoint, that is a better '
      + 'answer than this — check its robots.txt first, several disallow /api/.',
    cadence: 'hourly',
    fields: [
      {
        name: 'status',
        means: 'The whole-service verdict.',
        policy: 'strict',
        why:
          'The shortest value in this library and the one where a wrong answer is worst: '
          + 'reading "Operational" off the wrong element while a service is down is exactly '
          + 'the failure this product exists to refuse.',
        match: {
          pattern: String.raw`\b(?:all systems operational|operational|degraded performance|degraded|partial outage|major outage|under maintenance|service disruption)\b`,
          // The overall verdict is a heading; the per-component rows beside it
          // are spans. Without this the containment filter in ./analyse.ts drops
          // "All Systems Operational" in favour of a component's bare
          // "Operational", because one contains the other.
          tags: ['h1', 'h2', 'h3'],
          minLen: 3,
          maxLen: 80,
        },
        evidence: null,
      },
    ],
    examples: [
      {
        label: 'githubstatus.com',
        url: 'https://www.githubstatus.com/',
        permission:
          'robots.txt is three lines — "User-agent: *", "Disallow: /api/", "Disallow: '
          + '/embed/" — so the page itself is permitted and the JSON endpoint is not. The '
          + 'page footer links GitHub’s own terms, whose Acceptable Use Policies expressly '
          + 'permit scraping public non-personal information.',
        checked: '2026-08-23',
      },
    ],
  },
  {
    id: 'revision',
    group: 'content',
    name: 'Page revision',
    summary: 'When a document you depend on was last changed.',
    needs:
      'A page that states when it was last edited — most documentation, wikis and policy '
      + 'pages print this in a footer.',
    mismatch:
      'A page that does not say when it changed cannot be watched this way, and Assay reports '
      + 'that rather than watching something else. This notices that an edit happened; it does '
      + 'not tell you what the edit was.',
    cadence: 'daily',
    fields: [
      {
        name: 'last_changed',
        means: 'The line saying when the page was last edited.',
        policy: 'strict',
        why:
          'The whole sentence is watched rather than the date inside it, because the sentence '
          + 'is the only thing on the page that identifies which date this is. It is still '
          + 'short, and pages carry other dates.',
        match: {
          pattern: String.raw`\b(?:last (?:edited|modified|updated)|updated on|revised)\b`,
          minLen: 12,
          maxLen: 160,
        },
        evidence: null,
      },
    ],
    examples: [
      {
        label: 'A Wikipedia article',
        url: 'https://en.wikipedia.org/wiki/Web_scraping',
        permission:
          'robots.txt disallows /w/, /api/ and the Special: namespace for User-agent: *; an '
          + 'ordinary /wiki/ article is not among them. Wikimedia’s Terms of Use bar only '
          + 'automated use that is "abusive or disruptive". The Foundation asks bulk consumers '
          + 'to use the API or the published dumps instead — one article once a day is neither '
          + 'bulk nor a crawl.',
        checked: '2026-08-23',
      },
    ],
  },
];

/**
 * Pages that were tried as examples and are not offered, with what each failed.
 *
 * Recorded rather than dropped. This repository is public, the question "why is
 * X not in here" is the first one the list gets, and answering it in the product
 * is cheaper than being asked. Two of the four failed on Assay's own fetch,
 * which is a fact about this product rather than about the site.
 */
export const RULED_OUT: readonly { site: string; failed: string; detail: string }[] = [
  {
    site: 'Hacker News',
    failed: 'terms of service',
    detail:
      'robots.txt permits the front page, but Y Combinator’s Terms of Use — which Hacker '
      + 'News links itself — say "you will not engage in or use any data mining, robots, '
      + 'scraping or similar data gathering or extraction methods." Their Firebase API is '
      + 'the supported route and is not something a page tracker uses.',
  },
  {
    site: 'npmjs.com package pages',
    failed: 'the fetch',
    detail:
      'Returns 403 to Assay’s user-agent behind a Cloudflare challenge, and the host’s own '
      + 'robots.txt is unreachable for the same reason. registry.npmjs.org is a documented '
      + 'JSON API and is the right way to watch a package.',
  },
  {
    site: 'cpsc.gov/Recalls',
    failed: 'the fetch',
    detail:
      'robots.txt permits the bare path, and the page is genuinely useful — but it returns '
      + '403 to Assay’s user-agent specifically. CPSC publishes a free unauthenticated REST '
      + 'API, which this repository already uses as its benchmark oracle.',
  },
  {
    site: 'webscraper.io test sites',
    failed: 'robots.txt',
    detail:
      'A scraping practice sandbox, but its own robots.txt disallows /test-sites/e-commerce/ '
      + 'for every agent. books.toscrape.com serves the same purpose and disallows nothing.',
  },
  {
    site: 'Instagram, LinkedIn, Facebook, X',
    failed: 'robots.txt and terms of service',
    detail:
      'All four answer "User-agent: * / Disallow: /", and each one’s terms separately '
      + 'prohibit automated collection. LinkedIn’s robots.txt says so in a comment at the '
      + 'top of the file. Naming any of them would create exposure for everyone who forks '
      + 'this repository.',
  },
];

export const trackerById = (id: string): Tracker | undefined =>
  TRACKERS.find((t) => t.id === id);

/** The tier's numbers, for a screen that has to show what a tier means. */
export const thresholdsOf = (f: TrackerField): { tau: number; delta: number } =>
  TIER_THRESHOLDS[f.policy];

/**
 * How much of a tracker has a measured record behind it.
 *
 * A function rather than a constant so the screens read the real count. The day
 * somebody benchmarks another field, the screens change with the data.
 */
export const evidenceOf = (t: Tracker): { measured: number; total: number } => ({
  measured: t.fields.filter((f) => f.evidence !== null).length,
  total: t.fields.length,
});
