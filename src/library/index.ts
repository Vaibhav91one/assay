// The starter library: field contracts for PAGE SHAPES, not for sites.
//
// WHY THIS EXISTS. An empty Assay asks you to find a page, describe every field
// on it and approve, before you have seen the product do anything. The library
// removes the first two steps and leaves the third, because the third is the
// one that must never be removed.
//
// WHAT A TEMPLATE IS. A `Contract` document plus the sentences a human needs to
// decide whether it fits their page. `src/contracts/index.ts` already owns the
// format -- `ContractSchema`, `FieldPolicy`, the tier vocabulary -- and nothing
// here parallels it: `contractFor` below EMITS that schema's YAML, and
// `test/library.test.ts` runs every shipped template through `parseContract`.
// A template that failed to parse at apply time would be the worst possible
// first experience, so it fails in CI instead.
//
// WHY SHAPES AND NOT SITES. The obvious product is a catalogue of named
// endpoints -- "TikTok profile", "Instagram post" -- and the operator picks a
// site. That is a different product with different terms-of-service exposure,
// and it is one Assay cannot honestly sell: nothing in this repo has been run
// against those sites, and a scraper claiming to work against a site the author
// does not control is a claim with no evidence behind it. So a template
// describes a SHAPE -- "a page that lists dated safety notices, newest first" --
// and the operator supplies the URL. Assay never names a third-party service.
//
// WHAT IT DOES NOT CARRY: a selector. FEATURES.md F7 is "No selector editing.
// Ever", and a selector is a fact about one site's markup, which is exactly the
// thing a shape template cannot know. The operator pastes the value they can
// see and `describeFields` derives the resolver from where that text sits, the
// same derivation a model-made proposal goes through. A field whose example is
// not on the page is refused rather than watched hopefully -- see `mismatch`.
//
// EVIDENCE IS PER FIELD AND MOSTLY ABSENT, ON PURPOSE. `corpus/` holds three
// sites and the benchmark is 153 cases over one field on those three, so exactly
// one field in this whole file carries a measured record. Every other field says
// so in the same words. docs/LIMITATIONS.md 5 is explicit that tau 0.60 and
// delta 0.16 are fitted to this corpus and there is no evidence they transfer;
// implying the 153-case zero covers a shape it was never run against would
// undermine every real number this project publishes.

// The ONLY import in this file, and it must stay that way. `../contracts/tiers.js`
// imports nothing at all -- that is the property it was split out of
// `../contracts/index.js` for. The library screens are client components that
// display a tier's numbers, so anything heavier reached from here lands in the
// browser bundle. `contractFor` needs a YAML serialiser, which is exactly that,
// so it lives in `./contract.js` and the server imports it from there.
import { TIER_THRESHOLDS, type Tier } from '../contracts/tiers.js';

/**
 * A number this repo can show its work for.
 *
 * All three strings are required and none of them may be a summary of the
 * others: `claim` is what is true, `method` is how it was produced, `source` is
 * the file to check it against. A measurement missing any of the three is a
 * measurement a reader cannot contradict, which is the only kind this project
 * refuses to print.
 */
export interface Measurement {
  claim: string;
  method: string;
  /** A path in this repository. Committed, so it can be opened. */
  source: string;
}

/** One field a template watches. */
export interface TemplateField {
  /** snake_case. Becomes a column name and a proof-record key -- see `FieldName`. */
  name: string;
  /** What this field IS on a page of this shape. */
  means: string;
  /** How the value typically reads, so the operator knows what to paste. */
  looks: string;
  /** The tier, which is what fixes tau and delta. See `src/contracts/tiers.ts`. */
  policy: Tier;
  /** Why that tier and not another, in this product's terms. */
  why: string;
  /**
   * A measured record for THIS field, or null.
   *
   * Null is the common case and the screen prints it as a sentence rather than
   * omitting the row: an absent claim has to read as deliberate.
   */
  evidence: Measurement | null;
}

/** A page shape, and the contract to apply to one. */
export interface Template {
  id: string;
  name: string;
  /** The one line a list entry shows before you click it. */
  summary: string;
  /** What has to be true of the page. The operator reads this and says yes or no. */
  shape: string;
  /**
   * What Assay does when the page is NOT that shape.
   *
   * The honest half, and the half most catalogues omit. It is not a warning
   * written for this file -- it describes what `describeFields` and
   * `createTarget` already do, which is refuse.
   */
  mismatch: string;
  /** Where this shape usually sits, so a reader can tell whether they have one. */
  where: string;
  /** The suggested check interval. An operator can change it before applying. */
  cadence: string;
  fields: readonly TemplateField[];
}

// ---------------------------------------------------------------------------
// The one measured claim in this file
// ---------------------------------------------------------------------------

/**
 * `recall_title` on a recall or notice list, and nothing else in this file.
 *
 * This is the field the whole project was built on. `tools/bench.ts` runs 153
 * mutation cases over six captures from `corpus/` and `tools/replay.ts` runs 74
 * recorded runs across the same three sites -- all of them this field, on pages
 * of this shape. docs/LIMITATIONS.md 4 states the same restriction from the
 * other direction: one field, one vertical, nothing else has been run.
 *
 * The `method` names the threshold pair because that is what makes the number
 * ATTACHABLE rather than borrowed. The gated arm ran at tau 0.60 / delta 0.16;
 * this template declares the `normal` tier, which resolves to exactly that pair;
 * and `test/library.test.ts` asserts the identity through `thresholdsFor` on
 * this template's own emitted contract. Without that assertion the sentence
 * would be a number from one experiment printed beside a configuration from
 * somewhere else.
 */
const RECALL_TITLE_MEASURED: Measurement = {
  claim:
    '153 mutation cases over six captures from three real recall pages: the gate published '
    + '0 wrong values and abstained on 35.3%. Separately, 74 recorded runs across the same '
    + 'three sites healed 66 and abstained 0.',
  method:
    'npm run bench over corpus/ (ikea, mattel, chicco), gated arm at tau 0.60 / delta 0.16 -- '
    + 'the pair the `normal` tier resolves to, asserted against this template’s own '
    + 'contract in test/library.test.ts. npm run replay over the same corpus for the 74.',
  source: 'results/bench.json, results/events.jsonl',
};

// ---------------------------------------------------------------------------
// The templates
// ---------------------------------------------------------------------------

/**
 * Seven shapes. Each one is a shape somebody watches for a living, and each one
 * is described without naming a service that serves it.
 *
 * The tiers are not decoration. `strict` (0.70 / 0.20) interrupts a human more
 * often on purpose and is spent on values where a wrong one is expensive and
 * short -- money, dates, identifiers, a single status word, all of which give a
 * text-weighted scorer very little to work with (LIMITATIONS 4). `loose`
 * (0.60 / 0.12) FORFEITS the product's 0.0% claim for that field -- 4.4% wrong
 * on the benchmark -- and is spent only on prose, where picking either of two
 * near-identical blurbs is a risk the operator is willing to take. `normal` is
 * the sweep's own best pair and is what an unstated tier means.
 */
export const TEMPLATES: readonly Template[] = [
  {
    id: 'recall-notice',
    name: 'Recall or notice list',
    summary: 'A page that lists dated safety notices or recalls, newest first.',
    shape:
      'One page listing several notices. Each notice has a headline sentence naming the '
      + 'product and what went wrong, and usually a reference number and a publication date '
      + 'beside it. The newest notice is at the top, and the page changes when a new one '
      + 'is published rather than on a schedule.',
    mismatch:
      'Assay looks for the exact text you pasted for each field. If a value is not on the '
      + 'page -- the page is a single notice rather than a list, or the headline is rendered '
      + 'by JavaScript that a plain request does not run -- that field is refused by name and '
      + 'nothing is created. It does not start watching a field it cannot see once.',
    where: 'Manufacturer safety pages, regulator notice boards, product-support sections.',
    cadence: '24h',
    fields: [
      {
        name: 'recall_title',
        means: 'The headline of the newest notice.',
        looks: 'A long sentence: who is recalling what, and the hazard.',
        policy: 'normal',
        why:
          'Long, distinctive, prose-like -- the case the similarity scorer handles best, and '
          + 'the case the benchmark measured. The default tier is the measured one, so this '
          + 'field is left where the evidence is.',
        evidence: RECALL_TITLE_MEASURED,
      },
      {
        name: 'notice_id',
        means: 'The reference number the notice is filed under.',
        looks: 'Short and structured: a year and a sequence, or a regulator’s case number.',
        policy: 'strict',
        why:
          'Short and near-numeric, so the scorer has little text to go on and two notices’ '
          + 'reference numbers look alike. Strict abstains sooner rather than publishing the '
          + 'wrong notice’s number.',
        evidence: null,
      },
      {
        name: 'date_published',
        means: 'When the newest notice was published.',
        looks: 'A date, however the page writes one.',
        policy: 'strict',
        why:
          'A date is a handful of characters and a page of notices is full of other dates. '
          + 'A wrong date here is a wrong answer to "is this new?", which is the question the '
          + 'page is being watched for.',
        evidence: null,
      },
      {
        name: 'hazard',
        means: 'What the recalled product does wrong.',
        looks: 'A sentence or two of prose describing the failure and the injury.',
        policy: 'loose',
        why:
          'Prose, and the paragraph beside it often reads almost the same. Loose lowers the '
          + 'margin so a near-tie publishes instead of interrupting you -- and it forfeits '
          + 'the 0.0% claim for this field: 4.4% wrong on the benchmark. That is the trade.',
        evidence: null,
      },
    ],
  },
  {
    id: 'changelog',
    name: 'Changelog or release notes',
    summary: 'A page that lists releases, newest first, each with a version and a date.',
    shape:
      'Entries in reverse-chronological order. Each entry is headed by a version identifier '
      + 'and a date, followed by a short summary of what changed. The page grows at the top.',
    mismatch:
      'If the newest entry is behind a "load more" control, or the version is an image or an '
      + 'anchor rather than text, the value you paste will not be found in the HTML and the '
      + 'field is refused by name. Assay reads what a plain HTTP request returns; it does not '
      + 'run the page’s JavaScript unless a source you enabled on /skills does.',
    where: 'Product release pages, package release feeds, "what’s new" sections.',
    cadence: '12h',
    fields: [
      {
        name: 'latest_version',
        means: 'The version identifier of the newest release.',
        looks: 'A short token: dotted numbers, sometimes with a prefix or a suffix.',
        policy: 'strict',
        why:
          'A handful of characters, and every older version on the page is a near-identical '
          + 'decoy. This is the field most likely to be silently wrong, so it abstains soonest.',
        evidence: null,
      },
      {
        name: 'release_date',
        means: 'When the newest release was published.',
        looks: 'A date, however the page writes one.',
        policy: 'strict',
        why: 'Short, and surrounded by the dates of every previous release.',
        evidence: null,
      },
      {
        name: 'release_headline',
        means: 'The one-line summary of what changed.',
        looks: 'A sentence or a short title.',
        policy: 'normal',
        why:
          'Long enough for the scorer to work with, and not costly enough to be worth '
          + 'interrupting a human over. The default tier, which is the measured pair -- '
          + 'though not measured on this shape.',
        evidence: null,
      },
    ],
  },
  {
    id: 'pricing-table',
    name: 'Pricing table',
    summary: 'A page of plans side by side, each with a name, a price and a billing period.',
    shape:
      'Two or more plans laid out in columns or cards. Each carries a plan name, a headline '
      + 'price, and the period that price is charged over. A toggle between monthly and '
      + 'annual is common, and Assay reads whichever one the page serves by default.',
    mismatch:
      'If the price is assembled by script from a currency and a number, or the page you '
      + 'point at redirects to a region-specific one, the text you pasted will not be in the '
      + 'HTML and that field is refused. A monthly/annual toggle that is applied in the '
      + 'browser means Assay will keep reading the server’s default, not the one you '
      + 'last clicked.',
    where: 'Plan and pricing pages.',
    cadence: '24h',
    fields: [
      {
        name: 'plan_price',
        means: 'The headline price of the plan you care about.',
        looks: 'A currency symbol and a number, sometimes with a period suffix.',
        policy: 'strict',
        why:
          'Money, and short. FEATURES.md F2 opens with exactly this case: a price must never '
          + 'be wrong, and every other plan on the page is a plausible wrong answer.',
        evidence: null,
      },
      {
        name: 'plan_name',
        means: 'Which plan the price belongs to.',
        looks: 'One or two words.',
        policy: 'strict',
        why:
          'It anchors the price. A plan name that drifts to the neighbouring column turns a '
          + 'correct price into a wrong fact, so it takes the same scepticism as the price.',
        evidence: null,
      },
      {
        name: 'billing_period',
        means: 'What the price is charged over.',
        looks: 'A short phrase: per month, per year, per seat.',
        policy: 'strict',
        why: 'Two or three words, and the difference between them is a factor of twelve.',
        evidence: null,
      },
    ],
  },
  {
    id: 'status-page',
    name: 'Status page',
    summary: 'A page that states whether a service is up, and lists any open incident.',
    shape:
      'A single overall verdict near the top -- one word or a short phrase -- and below it '
      + 'either a list of components with their own states, or a feed of incidents with the '
      + 'newest first. The page is mostly unchanged, and the change is the point.',
    mismatch:
      'Most status pages render their current state from an API call in the browser, which '
      + 'means a plain request returns the shell and not the verdict. If that is true of yours '
      + 'the field is refused rather than watched, and no target is created. Check whether the '
      + 'words you can see are in the page source before you apply this.',
    where: 'Service status and uptime pages.',
    cadence: '1h',
    fields: [
      {
        name: 'overall_status',
        means: 'The single verdict for the whole service.',
        looks: 'One word or a short phrase.',
        policy: 'strict',
        why:
          'The shortest field in this library, and the one where a wrong value is worst: '
          + 'reading "operational" off the wrong element while a service is down is the '
          + 'failure this product exists to refuse.',
        evidence: null,
      },
      {
        name: 'incident_title',
        means: 'The headline of the newest open incident.',
        looks: 'A sentence naming the component and the symptom.',
        policy: 'normal',
        why:
          'Prose, and long enough to score. Held at the default rather than loosened, because '
          + 'a resolved incident and an open one often read almost identically.',
        evidence: null,
      },
    ],
  },
  {
    id: 'job-board',
    name: 'Job board',
    summary: 'A page listing open roles, each with a title and a location.',
    shape:
      'A list of openings. Each row carries a role title and a location, often with a team '
      + 'or department. The list is ordered by posting date or grouped by team, and rows '
      + 'appear and disappear as roles open and close.',
    mismatch:
      'Boards are commonly rendered by an embedded widget from another host, in which case '
      + 'the roles are not in the page you point at and every field is refused. Filters '
      + 'applied in the browser are also invisible to Assay -- it reads the unfiltered page '
      + 'the server returns.',
    where: 'Careers and open-roles pages.',
    cadence: '24h',
    fields: [
      {
        name: 'top_role',
        means: 'The title of the first role on the list.',
        looks: 'A job title, a few words long.',
        policy: 'normal',
        why:
          'Long enough for the scorer, and the neighbouring rows are genuinely different '
          + 'strings rather than near-duplicates. The default tier is the right one here.',
        evidence: null,
      },
      {
        name: 'role_location',
        means: 'Where that role is based.',
        looks: 'A city, a region, or the word for remote.',
        policy: 'strict',
        why:
          'Short, and every other row on the page carries one. A location that drifts a row '
          + 'is a wrong answer that looks entirely plausible.',
        evidence: null,
      },
      {
        name: 'open_count',
        means: 'How many roles the page says are open.',
        looks: 'A number, sometimes inside a phrase.',
        policy: 'strict',
        why: 'A bare number, which is the least the similarity scorer can be given.',
        evidence: null,
      },
    ],
  },
  {
    id: 'docs-page',
    name: 'Documentation page',
    summary: 'A reference page whose wording is the thing you need to notice changing.',
    shape:
      'A single documentation page with a title, a body of prose and code, and usually a '
      + 'version label or a last-updated line. The page is edited in place rather than '
      + 'appended to, which is what makes a diff worth watching.',
    mismatch:
      'If the page is generated per version and your URL redirects to "latest", Assay will '
      + 'follow the redirect and watch whatever "latest" points at -- which is a different '
      + 'page over time. Point it at a pinned version URL if that matters. A value not '
      + 'present in the returned HTML is refused by name, as everywhere else.',
    where: 'API references, guides, specification pages.',
    cadence: '24h',
    fields: [
      {
        name: 'page_title',
        means: 'The heading of the page.',
        looks: 'A short title.',
        policy: 'normal',
        why:
          'It changes rarely, and when it changes that is the signal. Nothing about it '
          + 'warrants interrupting a human sooner than the default does.',
        evidence: null,
      },
      {
        name: 'version_label',
        means: 'Which version of the thing this page documents.',
        looks: 'A short token, often in a badge or a selector.',
        policy: 'strict',
        why:
          'Short, and every other version in the switcher is a decoy sitting on the same '
          + 'page.',
        evidence: null,
      },
      {
        name: 'last_updated',
        means: 'The date the page says it was last changed.',
        looks: 'A date, often prefixed by "Updated".',
        policy: 'strict',
        why: 'Short, and a page of release history is full of other dates.',
        evidence: null,
      },
    ],
  },
  {
    id: 'product-detail',
    name: 'Product detail page',
    summary: 'One product, with its price and whether it can be bought.',
    shape:
      'A page about a single product: a name, a price, and a line saying whether it is in '
      + 'stock. Variants -- size, colour -- may change the price, and Assay reads whichever '
      + 'variant the page serves by default.',
    mismatch:
      'Price and stock are the two values most often written into the page by script after '
      + 'it loads, and a value that is not in the returned HTML is refused rather than '
      + 'watched. Pages that vary by region or currency will be read as whatever this '
      + 'machine’s request is served.',
    where: 'Catalogue and store pages for one item.',
    cadence: '6h',
    fields: [
      {
        name: 'product_name',
        means: 'The name of the product this page is about.',
        looks: 'A product title, sometimes with a model code.',
        policy: 'normal',
        why:
          'Long and distinctive, and there is only one of it on the page. The default tier '
          + 'is enough.',
        evidence: null,
      },
      {
        name: 'price',
        means: 'What the product costs.',
        looks: 'A currency symbol and a number.',
        policy: 'strict',
        why:
          'Money, short, and surrounded by struck-through originals, instalment amounts and '
          + 'the prices of related products. The canonical strict field.',
        evidence: null,
      },
      {
        name: 'availability',
        means: 'Whether it can be bought right now.',
        looks: 'A short phrase: in stock, sold out, back-ordered.',
        policy: 'strict',
        why:
          'Two or three words, and the opposite answer is two or three words that look '
          + 'much the same to a text scorer.',
        evidence: null,
      },
    ],
  },
];

export const templateById = (id: string): Template | undefined =>
  TEMPLATES.find((t) => t.id === id);

/** The tier's numbers, for a screen that has to show what a tier means. */
export const thresholdsOf = (f: TemplateField): { tau: number; delta: number } =>
  TIER_THRESHOLDS[f.policy];

/**
 * How much of a template has a measured record behind it.
 *
 * Three states rather than a boolean, because "one field of four" is the true
 * answer for the only template that has any evidence at all, and rounding it
 * either way is the exact blur this file exists to avoid.
 */
export function evidenceOf(t: Template): { measured: number; total: number } {
  return { measured: t.fields.filter((f) => f.evidence !== null).length, total: t.fields.length };
}

/**
 * The sentence a field with no measurement prints.
 *
 * One string, used everywhere, so an unmeasured field cannot accidentally be
 * described more softly on one screen than another.
 */
export const NOT_MEASURED =
  'Not measured. Nothing in results/ was run against this field or this page shape. '
  + 'The tier below is a judgement about the value’s length and its neighbours, not a '
  + 'number read off an experiment.';
