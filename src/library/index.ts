// The tracker library: named sites, plus one for everything else.
//
// You pick Amazon, you paste an Amazon link, you press Run. Assay reads that
// page, shows you what it found, and you approve. The approval is the same one
// the manual path and the model's proposal both end in -- `build` in
// `web/app/(app)/watch-actions.ts`, which parses `CreateInput` and calls
// `createTarget`. Nothing here has a private route into the store.
//
// A TRACKER IS A PRIOR ON FIELD DISCOVERY. Per field: a pattern for what the
// value looks like, optionally a pattern for the element's own identity, and a
// tier. `./analyse.ts` runs them over `candidatesOn` and hands each hit to
// `resolverFor`, so a tracker's proposal is the same object a hand-typed field
// produces, built by the same function. No model is involved, which is why this
// works with no API key set.
//
// WHAT MAKES A NAMED TRACKER NAMED is `Prior.select`. Amazon prints the list
// price and the selling price as identical-looking rupee amounts in identical
// spans; only `a-color-price` separates them. The generic tracker at the bottom
// of this file has no `select` on any field, and that is the whole difference.
//
// A SHIPPED `select` IS A SEED, NOT A PROMISE. These sites change. When one
// does, the prior matches nothing, `analyse` reports the field as not found and
// `createTarget` refuses rather than watching the wrong element. After a target
// exists the shipped hint is spent -- from the baseline on, the fingerprint
// scorer and the gate do the work.
//
// FEATURES.md F7 SURVIVES: there is no text box in this feature that a selector
// goes into, and the operator never sees one.
//
// NO FIELD HERE CARRIES A MEASURED CLAIM, and there is no slot for one. The
// benchmark is 153 cases over one field on three recall sites; none of these
// four is one of them, so there is nothing to say and the screens say nothing.
// docs/LIMITATIONS.md 5 is why: tau 0.60 and delta 0.16 are fitted to that
// corpus and there is no evidence they transfer.

// THE IMPORT RULE, WHICH IS A PROPERTY AND NOT A COUNT. Everything reached from
// here must itself import nothing, because these screens are client components
// and anything heavier lands in the browser bundle. `../contracts/tiers.js` was
// split out to have that property; `../connectors/record.js` has it too, and
// carries the one function that has to agree between the renderer and the
// priors written against it -- see `scraperTracker`. Two modules that import
// nothing weigh what one does. The YAML serialiser stays in `./contract.js`,
// cheerio in `./analyse.js`, and zod and `fetch` stay in
// `../connectors/scrapers.js`, which a server component imports directly.
import { TIER_THRESHOLDS, type Tier } from '../contracts/tiers.js';
import { keyClass, fieldNameFor } from '../connectors/record.js';

/**
 * How to recognise one value on a page.
 *
 * Patterns are STRINGS, never RegExp literals, and never carry `g`: `test` on a
 * global regex is stateful and these are reused across hundreds of candidates.
 */
export interface Prior {
  /** Must match the element's text. */
  pattern: string;
  /** Must not match the text. For a pattern that is right but has a false friend. */
  avoid?: string;
  /** Must match `tag#id.class.class`. The site-specific half. */
  select?: string;
  /** If set, the element's tag must be one of these. */
  tags?: string[];
  flags?: string;
  /** The band the text length falls in. Not decoration -- a bare date pattern
   *  matched 1,387 elements on one page before this existed. */
  minLen: number;
  maxLen: number;
}

export interface TrackerField {
  /** snake_case. Becomes a column name and a proof-record key -- see `FieldName`. */
  name: string;
  /** What the operator reads in the table. */
  label: string;
  /** Fixes tau and delta through the contract. See `src/contracts/tiers.ts`. */
  policy: Tier;
  match: Prior;
}

/** The shelves, in the order the catalogue draws them. */
export const GROUPS = [
  { id: 'shops', label: 'Shops' },
  { id: 'code', label: 'Code' },
  { id: 'reference', label: 'Reference' },
  { id: 'scrapers', label: 'Prebuilt scrapers' },
  { id: 'other', label: 'Anything else' },
] as const;

interface TrackerBase {
  id: string;
  /** Which shelf. Must be a `GROUPS` id or the card renders nowhere. */
  group: string;
  /** The site. */
  name: string;
  /** One short line under the title. */
  subheading: string;
  /** The shape of link this expects. */
  placeholder: string;
  /** Must be one of `CADENCES` in `src/agent/models.ts` -- the select is built
   *  from that enum and `build` validates against it. */
  cadence: string;
  fields: readonly TrackerField[];
}

/**
 * WHERE THE BYTES COME FROM, and the only thing a caller has to branch on.
 *
 * A `page` tracker is the original seven: the operator pastes a link and Assay
 * reads that page with its own guarded fetcher. A `scraper` tracker asks Bright
 * Data's prebuilt scraper for the dataset named by `datasetId` and renders the
 * JSON record it answers with into a document -- see `../connectors/record.ts`.
 *
 * A REAL DISCRIMINATOR RATHER THAN AN OPTIONAL FIELD, because everything after
 * the fetch is genuinely identical and the difference has to be impossible to
 * forget: `analyse` takes HTML and does not know which produced it, `approve`
 * calls the same `build`, and the engine sees one shape of run. The only code
 * that may look at `kind` is the code that decides how to get the bytes.
 */
export type Tracker =
  | (TrackerBase & { kind: 'page' })
  | (TrackerBase & {
    kind: 'scraper';
    /**
     * Bright Data's dataset_id, or null for the card that takes one from the
     * operator. Null is not "unknown" -- it is "the operator will say", and the
     * screens branch on it to ask.
     */
    datasetId: string | null;
    /** The page the dataset_id and the example record were read off. */
    docUrl: string;
  });

// --- shared priors ----------------------------------------------------------
// Written once because three trackers want the same idea of "a price". The
// site-specific `select` is added per tracker, never here.

const MONEY = String.raw`(?:[$£€¥₹]\s*\d[\d.,]*)|(?:\b\d[\d.,]*\s?(?:USD|EUR|GBP|INR)\b)`;
// A zero amount is a tax line or free shipping. books.toscrape.com prints
// "Price (excl. tax) £51.77", "Price (incl. tax) £51.77" and "Tax £0.00" in
// three identical cells, and without this the tax won.
const NOT_ZERO = String.raw`[$£€¥₹]\s*0(?:[.,]0+)?\s*$`;

// Bare "available" is deliberately absent: it matched "AVAILABLE ADD-ONS" on
// GitHub, "now available on AI Gateway" on a changelog and "Available-Dictionary"
// on MDN. Every alternative here carries stock context of its own.
const STOCK = String.raw`\b(?:in stock|out of stock|sold out|unavailable|back ?ordered?|pre-?order|discontinued|currently unavailable|ships? (?:in|within))\b`;

const DATE = String.raw`\b\d{4}-\d{2}-\d{2}\b|\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4}\b|\b\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{4}\b`;

// Everything else on a page shaped like a version: prices, percentages, file
// sizes, CSS units. A status page's "99.99 %" uptime was the first false
// positive this caught.
const VERSION = String.raw`\bv?\d+\.\d+(?:\.\d+)?(?:-[0-9A-Za-z.]+)?\b`;
const NOT_VERSION = String.raw`[$£€¥₹]|\bUSD\b|\bEUR\b|\bGBP\b|%|\b(?:MB|KB|GB|TB|kB|ms|px|pt|em)\b`;

export const TRACKERS: readonly Tracker[] = [
  {
    id: 'amazon',
    kind: 'page',
    group: 'shops',
    name: 'Amazon',
    subheading: 'Price and stock on one product page.',
    placeholder: 'https://www.amazon.in/dp/0143448706',
    cadence: '6h',
    fields: [
      {
        name: 'product_name',
        label: 'Product',
        policy: 'normal',
        // `productTitle` is the id Amazon has used for this element for years,
        // and there is exactly one of it on a product page.
        match: { pattern: String.raw`\S`, select: '#productTitle', minLen: 8, maxLen: 300 },
      },
      {
        name: 'price',
        label: 'Price',
        policy: 'strict',
        // The page carries the list price and the selling price as identical
        // rupee amounts in identical spans. `a-color-price` is the one that
        // means "what you would pay"; without it the M.R.P. wins on document
        // order and the operator watches a number that never moves.
        match: { pattern: MONEY, avoid: NOT_ZERO, select: 'a-color-price', minLen: 2, maxLen: 40 },
      },
      {
        name: 'availability',
        label: 'Availability',
        policy: 'strict',
        // Amazon's stock line is inside #availability whatever it says, so the
        // identity carries this field rather than the wording -- which is the
        // point, because the wording is what changes.
        match: { pattern: String.raw`\S`, select: '#availability', minLen: 3, maxLen: 200 },
      },
    ],
  },
  {
    id: 'github',
    kind: 'page',
    group: 'code',
    name: 'GitHub',
    subheading: 'The newest release on a repository.',
    placeholder: 'https://github.com/nodejs/node/releases',
    cadence: '12h',
    fields: [
      {
        name: 'latest_release',
        label: 'Latest release',
        policy: 'strict',
        // Every release title on the page is the same sentence with a different
        // number in it -- the near-identical-decoy case delta exists for.
        match: {
          pattern: String.raw`\S`,
          select: 'Link--primary',
          minLen: 4,
          maxLen: 160,
        },
      },
      {
        name: 'released_on',
        label: 'Released',
        policy: 'strict',
        // `relative-time` is GitHub's own element for a rendered timestamp, and
        // the tag hint is load-bearing rather than tidy: without it the date
        // prior takes the first date-shaped text in document order, which on
        // facebook/react is a DIFFERENT release's title further down the page.
        // It agreed with the newest release on nodejs/node by luck, which is
        // how this was nearly shipped wrong.
        match: { pattern: String.raw`\S`, tags: ['relative-time'], minLen: 4, maxLen: 90 },
      },
    ],
  },
  {
    id: 'pypi',
    kind: 'page',
    group: 'code',
    name: 'PyPI',
    subheading: 'The current version of a Python package.',
    placeholder: 'https://pypi.org/project/Django/',
    cadence: '12h',
    fields: [
      {
        name: 'version',
        label: 'Version',
        policy: 'strict',
        // PyPI's h1 is "Django 6.1" -- the name and the version together, which
        // is the whole fact. Reading the number alone would need it split out
        // of a heading it does not own.
        match: { pattern: String.raw`\S`, select: 'project-header__name', minLen: 3, maxLen: 120 },
      },
      {
        name: 'released_on',
        label: 'Released',
        policy: 'strict',
        // The sidebar carries several dates; `time` is the element PyPI renders
        // the release date into and the first one is the current release.
        match: { pattern: DATE, tags: ['time'], minLen: 6, maxLen: 60 },
      },
    ],
  },
  {
    id: 'arxiv',
    kind: 'page',
    group: 'reference',
    name: 'arXiv',
    subheading: 'The newest preprint in a category.',
    placeholder: 'https://arxiv.org/list/cs.CL/recent',
    cadence: '12h',
    fields: [
      {
        name: 'newest_paper',
        label: 'Newest paper',
        policy: 'strict',
        // The identifier rather than the title: the title sits in a div whose
        // text begins "Title:" from a descriptor span, and watching a value
        // with a label baked into it is watching the label too.
        match: { pattern: String.raw`arXiv:`, tags: ['a'], minLen: 8, maxLen: 40 },
      },
      {
        name: 'announcement',
        label: 'Batch',
        policy: 'normal',
        // "Fri, 21 Aug 2026 (showing first 50 of 76 entries)" -- the date and
        // the size of the batch in one sentence, and the only h3 near the top.
        match: { pattern: String.raw`\S`, tags: ['h3'], minLen: 10, maxLen: 120 },
      },
    ],
  },
  {
    id: 'mdn',
    kind: 'page',
    group: 'reference',
    name: 'MDN Web Docs',
    subheading: 'When a reference page was last revised.',
    placeholder: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/404',
    cadence: 'daily',
    fields: [
      {
        name: 'last_modified',
        label: 'Last modified',
        policy: 'strict',
        // The whole footer sentence rather than the date inside it, because the
        // sentence is the only thing on the page that says which date this is.
        match: {
          pattern: String.raw`\S`,
          select: 'article-footer__last-modified',
          minLen: 10,
          maxLen: 200,
        },
      },
    ],
  },
  {
    id: 'wikipedia',
    kind: 'page',
    group: 'reference',
    name: 'Wikipedia',
    subheading: 'When an article was last edited.',
    placeholder: 'https://en.wikipedia.org/wiki/Web_scraping',
    cadence: 'daily',
    fields: [
      {
        name: 'last_edited',
        label: 'Last edited',
        policy: 'strict',
        // MediaWiki's footer id, so this is the same field on every article and
        // every language.
        match: { pattern: String.raw`\S`, select: '#footer-info-lastmod', minLen: 10, maxLen: 200 },
      },
    ],
  },
  {
    id: 'any',
    kind: 'page',
    group: 'other',
    name: 'Any site',
    subheading: 'Assay looks for a price, stock, a version and a date.',
    placeholder: 'https://example.com/the-page',
    cadence: '6h',
    // No `select` on any field: this is the generic tracker and the identity
    // hints are exactly what it gives up. A field that finds nothing is
    // reported as not found, which on an arbitrary page is the common case and
    // the honest one.
    fields: [
      {
        name: 'price',
        label: 'Price',
        policy: 'strict',
        match: { pattern: MONEY, avoid: NOT_ZERO, minLen: 2, maxLen: 40 },
      },
      {
        name: 'availability',
        label: 'Availability',
        policy: 'strict',
        match: { pattern: STOCK, minLen: 3, maxLen: 70 },
      },
      {
        name: 'version',
        label: 'Version',
        policy: 'strict',
        match: { pattern: VERSION, avoid: NOT_VERSION, minLen: 2, maxLen: 140 },
      },
      {
        name: 'changed_on',
        label: 'Date',
        policy: 'strict',
        match: { pattern: DATE, minLen: 6, maxLen: 90 },
      },
    ],
  },
];

// --- prebuilt scrapers -------------------------------------------------------
//
// A scraper tracker's priors are GENERATED rather than written, and that is the
// difference in kind between these and the seven above. A page tracker's
// `select` is a judgement about somebody else's markup -- `a-color-price` is
// what tells Amazon's selling price from its list price, and it was found by
// looking. A record has no markup to judge: `../connectors/record.ts` writes the
// document, so the identity of every leaf is known exactly, and a hand-written
// hint here would be a second copy of a rule that already lives there.
//
// WHICH MEANS THE `select` IS NOT A SEED HERE, IT IS EXACT. `keyClass` is
// imported from the renderer rather than reimplemented, so the two cannot drift:
// if the class scheme ever changes, these priors change with it in the same
// commit. Everything after the first run is unchanged -- the hint is spent at
// baseline and the fingerprint scorer and the gate take over, exactly as the
// note at the top of this file says.

/**
 * One field, watching one key of the rendered record.
 *
 * The label is the key PATH as the vendor sent it -- `current_company.name`,
 * not "Current company name". Prettifying it would put Assay's word for the
 * field on the screen instead of Bright Data's, and when the vendor renames a
 * key the operator needs to be reading the name that changed.
 *
 * `\S` as the pattern, because nothing is known about the shape of the value
 * and inventing a shape is how a prior starts refusing real data. The identity
 * carries this field entirely, which is the same thing Amazon's `#availability`
 * does and for the same reason: the wording is what changes.
 *
 * The band is `candidatesOn`'s own 2..200, so a field is offered exactly when
 * the engine could see it -- there is no width here that promises more than the
 * enumeration behind it delivers.
 */
function scraperField(path: string, name: string): TrackerField {
  return {
    name,
    label: path,
    // `strict` throughout: a wrong value from a scraper is published under a
    // vendor's name against a real person's profile, and there is no page an
    // operator can eyeball to catch it. docs/LIMITATIONS.md 5 still applies --
    // tau and delta are fitted to the recall corpus and this is not that corpus.
    policy: 'strict',
    match: {
      pattern: String.raw`\S`,
      // Anchored at the end, against `tag#id.class` -- so `k-followers` does not
      // also match `k-followers-dup-1`, and `k-following` does not match at all.
      // The slug is `[a-z0-9-]` only, so there is nothing in it to escape.
      select: `\\.${keyClass(path)}$`,
      tags: ['dd'],
      minLen: 2,
      maxLen: 200,
    },
  };
}

/** The shape `scraperTracker` needs. Structural, so `PrebuiltScraper` satisfies
 *  it without this module importing `../connectors/scrapers.js` -- which pulls
 *  zod and `fetch` and is the reason for the import rule at the top. */
export interface ScraperEntry {
  id: string;
  datasetId: string | null;
  name: string;
  site: string;
  placeholder: string;
  fields: readonly string[];
  docUrl: string;
}

/**
 * A prebuilt scraper as a tracker.
 *
 * `fields` OVERRIDES the entry's own list, and that parameter is the whole
 * reason this is a function rather than a table. The two named scrapers have a
 * documented example record, so their keys are known before anything is
 * fetched. The operator-supplied-dataset card has no documented record at all,
 * so its fields can only come from the record its first Run actually returned --
 * and that read happens server-side, on every call, which is what keeps the
 * proposal from being trusted back out of the browser.
 *
 * `daily` rather than the 6h the shop trackers use: every run of one of these
 * is a billable request to Bright Data, and a default that quietly spends four
 * times as much is not a default to pick on the operator's behalf.
 */
export function scraperTracker(
  entry: ScraperEntry,
  // A path that cannot become a column name is dropped rather than carried
  // through to be refused by `createTarget` at the last step -- `FieldName` is
  // `/^[a-z][a-z0-9_]{0,30}$/`, so `current_company.name` is watched as
  // `current_company_name` and a key beginning with a digit is not watched.
  fields: readonly { path: string; name: string }[] = entry.fields.flatMap((path) => {
    const name = fieldNameFor(path);
    return name ? [{ path, name }] : [];
  }),
): Tracker {
  return {
    id: entry.id,
    kind: 'scraper',
    group: 'scrapers',
    name: entry.name,
    subheading: entry.datasetId
      ? `What Bright Data's scraper returns for one ${entry.site} link.`
      : 'Paste a Bright Data dataset ID and a link.',
    placeholder: entry.placeholder,
    cadence: 'daily',
    fields: fields.map((f) => scraperField(f.path, f.name)),
    datasetId: entry.datasetId,
    docUrl: entry.docUrl,
  };
}

export const trackerById = (id: string): Tracker | undefined =>
  TRACKERS.find((t) => t.id === id);

/** The tier's numbers, where a screen has to show what a tier means. */
export const thresholdsOf = (f: TrackerField): { tau: number; delta: number } =>
  TIER_THRESHOLDS[f.policy];
