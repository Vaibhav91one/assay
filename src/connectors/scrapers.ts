// Bright Data's prebuilt scrapers, as a source of records for the same gate.
//
// Verified against docs fetched 2026-08-23:
//   https://docs.brightdata.com/datasets/scrapers/overview
//   https://docs.brightdata.com/datasets/scrapers/instagram/quickstart
//   https://docs.brightdata.com/datasets/scrapers/linkedin/quickstart
//   https://docs.brightdata.com/api-reference/web-scraper-api/synchronous-requests
//   https://docs.brightdata.com/api-reference/scrapers/management-apis/monitor-progress
//   https://docs.brightdata.com/api-reference/scrapers/delivery-apis/download-snapshot
//
// What those pages establish, and what each one forces here:
//
//   * A prebuilt scraper is named by a `dataset_id`. There are over a thousand
//     of them and the pages above confirm exactly TWO by sight. See the note on
//     `SCRAPERS` for why that number, and not a rounder one, decides the shape
//     of this catalogue.
//   * Sync: `POST /datasets/v3/scrape?dataset_id=<id>&format=json`, bearer auth,
//     and the body is a BARE JSON ARRAY -- `[{"url": "..."}]` -- not an object
//     with an `input` key. The api-reference page for synchronous requests
//     describes an `{"input": [...]}` wrapper; every quickstart, including the
//     two cited above, shows the bare array. The quickstarts are the pages a
//     working integration is copied from, so the bare array is what this sends.
//   * Up to 20 URLs per sync request. This asks for one, so that ceiling is
//     documented rather than enforced -- there is no batch here to bound.
//   * "This synchronous request is subject to a 1 minute timeout limit", after
//     which "the API will return an HTTP 202 response ... you will receive a
//     snapshot ID". A 202 IS NOT A RECORD. Treating that body as one is how a
//     scraper starts publishing `{"snapshot_id": "s_..."}` as though it were a
//     profile, so it is the one response shape this module handles by name.
//   * Async retrieval is two endpoints, both GET with the same bearer:
//     `/datasets/v3/progress/{snapshot_id}` -> `{"status": "..."}` where status
//     is one of starting, running, ready, failed, canceled; and then
//     `/datasets/v3/snapshot/{snapshot_id}?format=json` -> an array of records.
//
// A record from here goes through `./record.ts` and into the same `ingestPage`
// a fetched page does. There is no second extraction path and no weaker check:
// the tau/delta gate, the brake, the contract and the measured wrong-value rate
// all apply because the engine cannot tell where the bytes came from.

import { z } from 'zod';
// Re-exported so the screens have one import for the whole feature, and because
// the two are used together everywhere: a path is offered only if it can be a
// field name, and watched only through the class the renderer gave it.
import { fieldNameFor } from './record.js';
import {
  TRACKERS, scraperTracker, type DatasetChoice, type ScraperEntry, type Tracker,
} from '../library/index.js';

export { fieldNameFor };

/** Assay's own name for one brand's shelf of prebuilt scrapers. */
export interface PrebuiltScraper extends ScraperEntry {
  /**
   * The dataset this card asks for when the operator picks nothing, or null for
   * the card that takes an id from the operator.
   *
   * ALWAYS THE FIRST ENTRY OF `datasets` where there is one, so the default is
   * never a fourth fact to keep in sync -- `assertCurated` pins that.
   */
  datasetId: string | null;
  /**
   * The JSON keys worth watching, as PATHS into a DOCUMENTED example record
   * (`current_company.name`, not `current_company`), and empty for every card
   * whose record nobody has documented.
   *
   * Two cards have entries here -- Instagram and LinkedIn -- because those two
   * quickstarts print an example record and it was read. Every other card
   * carries `[]` and means it: the fields come from the record the operator's
   * own Run returned, through `fieldsFromRecord`. Hand-writing a plausible list
   * for a scraper whose output has never been seen is the confident-wrongness
   * this product exists to refuse, and it is worse here than a blank table --
   * the operator would tick six boxes and get six rows saying "not on this
   * page".
   *
   * Long prose keys are left out of the two that do have entries: `candidatesOn`
   * ignores text longer than 200 characters, so a biography would be reported as
   * "not on this page" every time, which reads as a bug in Assay rather than as
   * the limit it is.
   */
  fields: readonly string[];
  docUrl: string;
}

/**
 * The doc page a curated brand card links out to.
 *
 * NOT A PAGE THAT NAMES THAT BRAND'S dataset_id, because no such page was read.
 * The ids on the brand cards below came from Bright Data's own
 * `GET /datasets/list` on the operator's account -- see `listDatasets` -- which
 * is a better source than a doc page: it is the account's own inventory rather
 * than marketing copy about it. So the link goes to the page that explains what
 * a prebuilt scraper IS, and the check on any particular id is the one the
 * operator can run themselves against the same endpoint. Instagram and LinkedIn
 * keep their own doc URLs, which do name their ids.
 */
const SCRAPER_DOCS = 'https://docs.brightdata.com/datasets/scrapers/overview';

/**
 * The catalogue: twenty-eight brands, and why a brand rather than a dataset.
 *
 * WHERE EVERY ID BELOW CAME FROM, and there is exactly one answer.
 * `GET https://api.brightdata.com/datasets/list` with the account's bearer
 * returns the authoritative inventory -- 1,744 entries of `{id, name, size?}`
 * when this was curated. Every `dataset_id` in this file was looked up in that
 * response BY EXACT NAME rather than typed, so there is no id here that the
 * endpoint did not return, and `test/bd-catalogue.test.ts` re-fetches the list
 * and asserts membership rather than trusting a copy that would rot.
 *
 * A dataset_id cannot be derived, guessed or pattern-matched --
 * `gd_l1vikfch901nx3by4` and `gd_l1viktl72bvl7bjuj0` share a prefix and nothing
 * else -- so an invented one would 404 and the operator would reasonably read
 * that as Assay being broken.
 *
 * THE CARD IS THE BRAND, NOT THE DATASET. LinkedIn alone has around sixty
 * entries in that list, most of them somebody's filtered snapshot
 * (`Linkedin Profiles CEO's by Industry`, `HHU Sophia and Rafaela LinkedIn
 * Companies Employees 13/03/2023`). Sixty cards is not a library, and one card
 * per dataset would put the least useful sixty-fifth of the catalogue on the
 * same footing as `LinkedIn people profiles`. So a card carries the brand's
 * handful of general-purpose scrapers and the operator picks inside it.
 *
 * WHAT IS AND IS NOT ON A CARD, said as a rule rather than case by case. A
 * dataset is offered when its name says it collects a THING BY ITS URL -- a
 * profile, a post, a product, a listing -- because that is what this flow does:
 * `scrape` posts `[{"url": ...}]`. Names that say discovery or search
 * (`Instagram posts search by keyword`, `Google Shopping products search US`)
 * want a query, not a link, and are left to `searchDatasets` rather than put on
 * a card that would fail on the operator's first Run.
 *
 * THAT SELECTION IS A READING OF A NAME AND NOTHING MORE. Bright Data publishes
 * no input schema on this endpoint, so a dataset whose name reads like a URL
 * collector but wants something else will fail -- LOUDLY, with Bright Data's own
 * error text carried through `ScrapeError` and onto the screen. That is a
 * visible wrong guess, not a silent one, which is the difference that matters.
 */
export const SCRAPERS: readonly PrebuiltScraper[] = [
  {
    id: 'bd-linkedin',
    // The default, and the ONE id on this card that two sources agree on: the
    // "Your first request" example on the scrapers overview page, and
    // `/datasets/list`, which returns it under the same name.
    datasetId: 'gd_l1viktl72bvl7bjuj0',
    name: 'LinkedIn',
    site: 'linkedin.com',
    group: 'work',
    subheading: `What Bright Data's scrapers return for one linkedin.com link.`,
    placeholder: 'https://www.linkedin.com/in/satyanadella',
    // From the documented example record: name, city, country_code, position,
    // current_company (nested: name, link), followers, connections, url.
    // `current_company.name` is a nested key and is watched as one -- it is a
    // leaf in the rendered document like any other.
    //
    // THESE APPLY TO THE DEFAULT DATASET ONLY. Pick another entry in the list
    // below and there is no documented record for it, so the fields come from
    // the record that Run actually returned -- see `read` in
    // `web/app/(app)/library/actions.ts`.
    fields: ['city', 'connections', 'country_code', 'current_company.name', 'followers', 'name'],
    datasets: [
      { id: 'gd_l1viktl72bvl7bjuj0', name: 'LinkedIn people profiles' },
      { id: 'gd_l1vikfnt1wgvvqz95w', name: 'LinkedIn company information' },
      { id: 'gd_lpfll7v5hcqtkxl6l', name: 'Linkedin job listings information' },
      { id: 'gd_lyy3tktm25m4avu764', name: 'LinkedIn posts' },
    ],
    docUrl: 'https://docs.brightdata.com/datasets/scrapers/linkedin/quickstart',
  },
  {
    id: 'bd-instagram',
    // The default, read off the curl example and the endpoint URL on the
    // quickstart in `docUrl`, and returned by `/datasets/list` under the same
    // name. Two sources, same id.
    datasetId: 'gd_l1vikfch901nx3by4',
    name: 'Instagram',
    site: 'instagram.com',
    group: 'social',
    subheading: `What Bright Data's scrapers return for one instagram.com link.`,
    placeholder: 'https://www.instagram.com/instagram',
    // From the documented example record: user_name, full_name, biography,
    // followers, following, posts_count, is_verified, url. `biography` is
    // omitted because `candidatesOn` ignores text over 200 characters; `url` is
    // the input echoed back and watching it would be watching what you typed.
    // The default dataset only -- see the note on LinkedIn's `fields`.
    fields: ['followers', 'following', 'full_name', 'is_verified', 'posts_count', 'user_name'],
    datasets: [
      { id: 'gd_l1vikfch901nx3by4', name: 'Instagram - Profiles' },
      { id: 'gd_lk5ns7kz21pck8jpis', name: 'Instagram - Posts' },
      { id: 'gd_lyclm20il4r5helnj', name: 'Instagram - Reels' },
      { id: 'gd_ltppn085pokosxh13', name: 'Instagram - Comments' },
    ],
    docUrl: 'https://docs.brightdata.com/datasets/scrapers/instagram/quickstart',
  },
  {
    id: 'bd-tiktok',
    datasetId: 'gd_l1villgoiiidt09ci',
    name: 'TikTok',
    site: 'tiktok.com',
    group: 'social',
    subheading: `What Bright Data's scrapers return for one tiktok.com link.`,
    placeholder: 'https://www.tiktok.com/@tiktok',
    fields: [],
    datasets: [
      { id: 'gd_l1villgoiiidt09ci', name: 'TikTok - Profiles' },
      { id: 'gd_lu702nij2f790tmv9h', name: 'TikTok - Posts' },
      { id: 'gd_lkf2st302ap89utw5k', name: 'TikTok - Comments' },
      { id: 'gd_m45m1u911dsa4274pi', name: 'TikTok Shop' },
    ],
    docUrl: SCRAPER_DOCS,
  },
  {
    id: 'bd-facebook',
    datasetId: 'gd_mf0urb782734ik94dz',
    name: 'Facebook',
    site: 'facebook.com',
    group: 'social',
    subheading: `What Bright Data's scrapers return for one facebook.com link.`,
    placeholder: 'https://www.facebook.com/zuck',
    fields: [],
    datasets: [
      { id: 'gd_mf0urb782734ik94dz', name: 'Facebook - Profiles' },
      { id: 'gd_lyclm1571iy3mv57zw', name: 'Facebook - Posts by post URL' },
      { id: 'gd_lyclm3ey2q6rww027t', name: 'Facebook - Reels by profile URL' },
      { id: 'gd_lkay758p1eanlolqw8', name: 'Facebook -  Comments' },
      { id: 'gd_m14sd0to1jz48ppm51', name: 'Facebook Events' },
      { id: 'gd_lvt9iwuh6fbcwmx1a', name: 'Facebook Marketplace' },
    ],
    docUrl: SCRAPER_DOCS,
  },
  {
    id: 'bd-youtube',
    datasetId: 'gd_lk538t2k2p1k3oos71',
    name: 'YouTube',
    site: 'youtube.com',
    group: 'social',
    subheading: `What Bright Data's scrapers return for one youtube.com link.`,
    placeholder: 'https://www.youtube.com/@BBCNews',
    fields: [],
    datasets: [
      { id: 'gd_lk538t2k2p1k3oos71', name: 'YouTube - Channels' },
      { id: 'gd_lk56epmy2i5g7lzu0k', name: 'Youtube - Videos posts' },
      { id: 'gd_lk9q0ew71spt1mxywf', name: 'Youtube - Comments' },
    ],
    docUrl: SCRAPER_DOCS,
  },
  {
    id: 'bd-x',
    datasetId: 'gd_lwxmeb2u1cniijd7t4',
    name: 'X (formerly Twitter)',
    site: 'x.com',
    group: 'social',
    subheading: `What Bright Data's scrapers return for one x.com link.`,
    placeholder: 'https://x.com/nasa',
    fields: [],
    datasets: [
      { id: 'gd_lwxmeb2u1cniijd7t4', name: 'X (formerly Twitter) - Profiles' },
      { id: 'gd_lwxkxvnf1cynvib9co', name: 'X (formerly Twitter) - Posts' },
    ],
    docUrl: SCRAPER_DOCS,
  },
  {
    id: 'bd-reddit',
    datasetId: 'gd_lvz8ah06191smkebj4',
    name: 'Reddit',
    site: 'reddit.com',
    group: 'social',
    subheading: `What Bright Data's scrapers return for one reddit.com link.`,
    placeholder: 'https://www.reddit.com/r/programming/comments/1abcdef/a_post/',
    fields: [],
    datasets: [
      { id: 'gd_lvz8ah06191smkebj4', name: 'Reddit- Posts' },
      { id: 'gd_lvzdpsdlw09j6t702', name: 'Reddit - Comments' },
    ],
    docUrl: SCRAPER_DOCS,
  },
  {
    id: 'bd-threads',
    datasetId: 'gd_mde7jg3ld2h3hnnf2',
    name: 'Threads',
    site: 'threads.net',
    group: 'social',
    subheading: `What Bright Data's scrapers return for one threads.net link.`,
    placeholder: 'https://www.threads.net/@zuck',
    fields: [],
    datasets: [
      { id: 'gd_mde7jg3ld2h3hnnf2', name: 'Threads - Profiles' },
    ],
    docUrl: SCRAPER_DOCS,
  },
  {
    id: 'bd-pinterest',
    datasetId: 'gd_lk0zv93c2m9qdph46z',
    name: 'Pinterest',
    site: 'pinterest.com',
    group: 'social',
    subheading: `What Bright Data's scrapers return for one pinterest.com link.`,
    placeholder: 'https://www.pinterest.com/pinterest/',
    fields: [],
    datasets: [
      { id: 'gd_lk0zv93c2m9qdph46z', name: 'Pinterest - Profiles' },
      { id: 'gd_lk0sjs4d21kdr7cnlv', name: 'Pinterest - Posts' },
    ],
    docUrl: SCRAPER_DOCS,
  },
  {
    id: 'bd-quora',
    datasetId: 'gd_lvz1rbj81afv3m6n5y',
    name: 'Quora',
    site: 'quora.com',
    group: 'social',
    subheading: `What Bright Data's scrapers return for one quora.com link.`,
    placeholder: 'https://www.quora.com/What-is-web-scraping',
    fields: [],
    datasets: [
      { id: 'gd_lvz1rbj81afv3m6n5y', name: 'Quora posts' },
    ],
    docUrl: SCRAPER_DOCS,
  },
  {
    id: 'bd-amazon',
    datasetId: 'gd_l7q7dkf244hwjntr0',
    name: 'Amazon',
    site: 'amazon.com',
    group: 'commerce',
    subheading: `What Bright Data's scrapers return for one amazon.com link.`,
    placeholder: 'https://www.amazon.com/dp/B08N5WRWNW',
    fields: [],
    datasets: [
      { id: 'gd_l7q7dkf244hwjntr0', name: 'Amazon products' },
      { id: 'gd_me8eqo9tqtzc3vim6', name: 'Amazon - price and availability' },
      { id: 'gd_le8e811kzy4ggddlq', name: 'Amazon Reviews' },
      { id: 'gd_lhotzucw1etoe5iw1k', name: 'Amazon sellers info' },
      { id: 'gd_ldkj3fbv1e3hakc9c0', name: 'Amazon tech specs' },
      { id: 'gd_l8wptc3u2h91rpx1sl', name: 'Amazon.co.uk products' },
      { id: 'gd_l8b5p6rc49fvgkrhr', name: 'Amazon.de products' },
      { id: 'gd_l93tr5392lx4dch91f', name: 'Amazon.in products' },
    ],
    docUrl: SCRAPER_DOCS,
  },
  {
    id: 'bd-walmart',
    datasetId: 'gd_l95fol7l1ru6rlo116',
    name: 'Walmart',
    site: 'walmart.com',
    group: 'commerce',
    subheading: `What Bright Data's scrapers return for one walmart.com link.`,
    placeholder: 'https://www.walmart.com/ip/12345678',
    fields: [],
    datasets: [
      { id: 'gd_l95fol7l1ru6rlo116', name: 'Walmart - products' },
      { id: 'gd_me8ewfsm1bq645ma5g', name: 'Walmart - price and availability' },
      { id: 'gd_mpql1v8g2o8o6l1wzd', name: 'Walmart Reviews' },
      { id: 'gd_m7ke48w81ocyu4hhz0', name: 'Walmart sellers info' },
    ],
    docUrl: SCRAPER_DOCS,
  },
  {
    id: 'bd-target',
    datasetId: 'gd_ln8r3su92jn7dxwrl5',
    name: 'Target',
    site: 'target.com',
    group: 'commerce',
    subheading: `What Bright Data's scrapers return for one target.com link.`,
    placeholder: 'https://www.target.com/p/-/A-12345678',
    fields: [],
    datasets: [
      { id: 'gd_ln8r3su92jn7dxwrl5', name: 'Target - products' },
    ],
    docUrl: SCRAPER_DOCS,
  },
  {
    id: 'bd-ebay',
    datasetId: 'gd_ltr9mjt81n0zzdk1fb',
    name: 'eBay',
    site: 'ebay.com',
    group: 'commerce',
    subheading: `What Bright Data's scrapers return for one ebay.com link.`,
    placeholder: 'https://www.ebay.com/itm/123456789012',
    fields: [],
    datasets: [
      { id: 'gd_ltr9mjt81n0zzdk1fb', name: 'eBay' },
    ],
    docUrl: SCRAPER_DOCS,
  },
  {
    id: 'bd-etsy',
    datasetId: 'gd_ltppk0jdv1jqz25mz',
    name: 'Etsy',
    site: 'etsy.com',
    group: 'commerce',
    subheading: `What Bright Data's scrapers return for one etsy.com link.`,
    placeholder: 'https://www.etsy.com/listing/123456789/a-thing',
    fields: [],
    datasets: [
      { id: 'gd_ltppk0jdv1jqz25mz', name: 'Etsy' },
    ],
    docUrl: SCRAPER_DOCS,
  },
  {
    id: 'bd-bestbuy',
    datasetId: 'gd_ltre1jqe1jfr7cccf',
    name: 'Best Buy',
    site: 'bestbuy.com',
    group: 'commerce',
    subheading: `What Bright Data's scrapers return for one bestbuy.com link.`,
    placeholder: 'https://www.bestbuy.com/site/x/1234567.p',
    fields: [],
    datasets: [
      { id: 'gd_ltre1jqe1jfr7cccf', name: 'Best Buy products' },
    ],
    docUrl: SCRAPER_DOCS,
  },
  {
    id: 'bd-zara',
    datasetId: 'gd_lct4vafw1tgx27d4o0',
    name: 'Zara',
    site: 'zara.com',
    group: 'commerce',
    subheading: `What Bright Data's scrapers return for one zara.com link.`,
    placeholder: 'https://www.zara.com/us/en/a-product-p01234567.html',
    fields: [],
    datasets: [
      { id: 'gd_lct4vafw1tgx27d4o0', name: 'Zara - Products' },
      { id: 'gd_lcx5utgek9mxrsiie', name: 'Zara Home Products' },
    ],
    docUrl: SCRAPER_DOCS,
  },
  {
    id: 'bd-shopee',
    datasetId: 'gd_msym598r1428opym56',
    name: 'Shopee',
    site: 'shopee.com',
    group: 'commerce',
    subheading: `What Bright Data's scrapers return for one shopee.com link.`,
    placeholder: 'https://shopee.sg/product-i.12345.67890',
    fields: [],
    datasets: [
      { id: 'gd_msym598r1428opym56', name: 'Shopee - products unified schema' },
    ],
    docUrl: SCRAPER_DOCS,
  },
  {
    id: 'bd-zillow',
    datasetId: 'gd_lfqkr8wm13ixtbd8f5',
    name: 'Zillow',
    site: 'zillow.com',
    group: 'places',
    subheading: `What Bright Data's scrapers return for one zillow.com link.`,
    placeholder: 'https://www.zillow.com/homedetails/1-Main-St/12345678_zpid/',
    fields: [],
    datasets: [
      { id: 'gd_lfqkr8wm13ixtbd8f5', name: 'Zillow properties listing information' },
      { id: 'gd_lxu1cz9r88uiqsosl', name: 'Zillow price history' },
      { id: 'gd_lmhq4upd1rv58wndlm', name: 'Zillow Zestimate History' },
    ],
    docUrl: SCRAPER_DOCS,
  },
  {
    id: 'bd-airbnb',
    datasetId: 'gd_ld7llo0n20qqycm0kt',
    name: 'Airbnb',
    site: 'airbnb.com',
    group: 'places',
    subheading: `What Bright Data's scrapers return for one airbnb.com link.`,
    placeholder: 'https://www.airbnb.com/rooms/12345678',
    fields: [],
    datasets: [
      { id: 'gd_ld7llo0n20qqycm0kt', name: 'Airbnb Properties Information' },
    ],
    docUrl: SCRAPER_DOCS,
  },
  {
    id: 'bd-booking',
    datasetId: 'gd_m5mbdl081229ln6t4a',
    name: 'Booking.com',
    site: 'booking.com',
    group: 'places',
    subheading: `What Bright Data's scrapers return for one booking.com link.`,
    placeholder: 'https://www.booking.com/hotel/gb/a-hotel.html',
    fields: [],
    datasets: [
      { id: 'gd_m5mbdl081229ln6t4a', name: 'Booking Hotel Listings' },
    ],
    docUrl: SCRAPER_DOCS,
  },
  {
    id: 'bd-yelp',
    datasetId: 'gd_lgugwl0519h1p14rwk',
    name: 'Yelp',
    site: 'yelp.com',
    group: 'places',
    subheading: `What Bright Data's scrapers return for one yelp.com link.`,
    placeholder: 'https://www.yelp.com/biz/a-business-san-francisco',
    fields: [],
    datasets: [
      { id: 'gd_lgugwl0519h1p14rwk', name: 'Yelp businesses overview' },
      { id: 'gd_lgzhlu9323u3k24jkv', name: 'Yelp businesses reviews' },
    ],
    docUrl: SCRAPER_DOCS,
  },
  {
    id: 'bd-glassdoor',
    datasetId: 'gd_l7j0bx501ockwldaqf',
    name: 'Glassdoor',
    site: 'glassdoor.com',
    group: 'work',
    subheading: `What Bright Data's scrapers return for one glassdoor.com link.`,
    placeholder: 'https://www.glassdoor.com/Overview/Working-at-Google-EI_IE9079.11,17.htm',
    fields: [],
    datasets: [
      { id: 'gd_l7j0bx501ockwldaqf', name: 'Glassdoor companies overview information' },
      { id: 'gd_l7j1po0921hbu0ri1z', name: 'Glassdoor companies reviews' },
      { id: 'gd_lpfbbndm1xnopbrcr0', name: 'Glassdoor job listings information' },
    ],
    docUrl: SCRAPER_DOCS,
  },
  {
    id: 'bd-indeed',
    datasetId: 'gd_l4dx9j9sscpvs7no2',
    name: 'Indeed',
    site: 'indeed.com',
    group: 'work',
    subheading: `What Bright Data's scrapers return for one indeed.com link.`,
    placeholder: 'https://www.indeed.com/viewjob?jk=0123456789abcdef',
    fields: [],
    datasets: [
      { id: 'gd_l4dx9j9sscpvs7no2', name: 'Indeed job listings information' },
      { id: 'gd_l7qekxkv2i7ve6hx1s', name: 'Indeed companies info' },
    ],
    docUrl: SCRAPER_DOCS,
  },
  {
    id: 'bd-crunchbase',
    datasetId: 'gd_l1vijqt9jfj7olije',
    name: 'Crunchbase',
    site: 'crunchbase.com',
    group: 'work',
    subheading: `What Bright Data's scrapers return for one crunchbase.com link.`,
    placeholder: 'https://www.crunchbase.com/organization/anthropic',
    fields: [],
    datasets: [
      { id: 'gd_l1vijqt9jfj7olije', name: 'Crunchbase companies information' },
      { id: 'gd_mnx2txa59pcroghrl', name: 'Crunchbase people information' },
    ],
    docUrl: SCRAPER_DOCS,
  },
  {
    id: 'bd-google',
    datasetId: 'gd_lh0tnzlo2bie4uhdhr',
    name: 'Google',
    site: 'google.com',
    group: 'web',
    subheading: `What Bright Data's scrapers return for one google.com link.`,
    placeholder: 'https://www.google.com/maps/place/British+Museum',
    fields: [],
    datasets: [
      { id: 'gd_lh0tnzlo2bie4uhdhr', name: 'Google Maps businesses' },
      { id: 'gd_luzfs1dn2oa0teb81', name: 'Google maps reviews' },
      { id: 'gd_lsk382l8xei8vzm4u', name: 'Google Play Store' },
      { id: 'gd_m6zagkt024uwvvwuyu', name: 'Google Play Store reviews' },
      { id: 'gd_lnsxoxzi1omrwnka5r', name: 'Google News' },
    ],
    docUrl: SCRAPER_DOCS,
  },
  {
    id: 'bd-wikipedia',
    datasetId: 'gd_lr9978962kkjr3nx49',
    name: 'Wikipedia',
    site: 'wikipedia.org',
    group: 'web',
    subheading: `What Bright Data's scrapers return for one wikipedia.org link.`,
    placeholder: 'https://en.wikipedia.org/wiki/Web_scraping',
    fields: [],
    datasets: [
      { id: 'gd_lr9978962kkjr3nx49', name: 'Wikipedia articles' },
    ],
    docUrl: SCRAPER_DOCS,
  },
  {
    id: 'bd-github',
    datasetId: 'gd_lyrexgxc24b3d4imjt',
    name: 'GitHub',
    site: 'github.com',
    group: 'web',
    subheading: `What Bright Data's scrapers return for one github.com link.`,
    placeholder: 'https://github.com/nodejs/node',
    fields: [],
    datasets: [
      { id: 'gd_lyrexgxc24b3d4imjt', name: 'Github repository' },
    ],
    docUrl: SCRAPER_DOCS,
  },

  {
    id: 'dataset',
    // The point of this card. There is no id to cite because the operator
    // supplies it, and a null here is what the screens branch on to ask for one.
    datasetId: null,
    name: 'Any Bright Data scraper',
    site: 'brightdata.com',
    group: 'scrapers',
    subheading: 'Paste a Bright Data dataset ID and a link.',
    placeholder: 'https://example.com/the-page',
    // Nothing is known about an arbitrary dataset's record shape, so nothing is
    // claimed. The fields come from the record the operator's first Run
    // actually returns -- see `fieldsFromRecord`.
    fields: [],
    // No choice to offer: this card's whole job is to take an id nobody here
    // curated. Search fills it -- see `searchDatasets`.
    datasets: [],
    docUrl: SCRAPER_DOCS,
  },
];

export const scraperById = (id: string): PrebuiltScraper | undefined =>
  SCRAPERS.find((s) => s.id === id);

/**
 * The whole catalogue, both kinds, in one list.
 *
 * IT IS ASSEMBLED HERE RATHER THAN IN `../library/index.ts` because that module
 * must import nothing heavier than a module which itself imports nothing -- it
 * is reached from client components, and this file carries zod and `fetch`. So
 * the tracker VOCABULARY lives there and the JOIN lives here, and the screens
 * that need both are server components, which is every screen in
 * `web/app/(app)/library/` except the one that takes a tracker as a prop.
 */
export const ALL_TRACKERS: readonly Tracker[] = [
  ...TRACKERS,
  ...SCRAPERS.map((s) => scraperTracker(s)),
];

/** One tracker of either kind, by id. What the library screens look up. */
export const libraryTrackerById = (id: string): Tracker | undefined =>
  ALL_TRACKERS.find((t) => t.id === id);

// --- the lookup other surfaces use -------------------------------------------
//
// FOR THE COMPOSER, and for anything else that has a word and needs a scraper.
// The prompt bar lets someone type "linkedin" and get the LinkedIn scraper; it
// must not do that by keeping its own table of dataset_ids, because a second
// table is a second thing to be wrong and the ids are the part that cannot be
// guessed. So the curated set has exactly one home -- `SCRAPERS`, above -- and
// this is the door into it.
//
// SYNCHRONOUS, AND DELIBERATELY SO. It resolves against the twenty-eight
// curated brands only, which are in this file, so it costs no request, spends no
// Bright Data credit and cannot fail. The full 1,744 need the network and live
// behind `searchDatasets`, which is async and says so in its type. A menu that
// has to await a third party to draw itself is a menu that sometimes does not
// draw.

/** A resolved scraper: the brand card, and which of its datasets was named. */
export interface ScraperMatch {
  entry: PrebuiltScraper;
  /** The dataset to run. `entry.datasetId` unless the query named another. */
  dataset: DatasetChoice;
}

/** The curated brands, in shelf order. Excludes the open card, which has no
 *  dataset of its own and so is not something to resolve a name to. */
export const CURATED_SCRAPERS: readonly PrebuiltScraper[] =
  SCRAPERS.filter((s) => s.datasetId !== null);

const norm = (s: string): string => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '');

/**
 * A brand, a site, a dataset name or a dataset id -> a real curated entry.
 *
 * `findScraper('linkedin')`, `findScraper('LinkedIn people profiles')`,
 * `findScraper('linkedin.com')`, `findScraper('bd-linkedin')` and
 * `findScraper('gd_l1viktl72bvl7bjuj0')` all resolve to the LinkedIn card; the
 * last two also fix WHICH dataset, where the first three take the card's
 * default.
 *
 * NULL RATHER THAN A NEAREST GUESS. There is no fuzzy match here on purpose: a
 * prompt bar that turns "linkden" into a billable scrape of somebody's profile
 * has guessed with the operator's money. Punctuation and case are normalised
 * away -- `Best Buy`, `bestbuy` and `best-buy` are the same word -- and beyond
 * that a name either names something or it does not.
 *
 * IT NEVER RETURNS AN ID THIS FILE DID NOT SHIP, which is the property the
 * caller is entitled to rely on: every id it can hand back is one
 * `/datasets/list` returned, pinned by `test/bd-catalogue.test.ts`.
 */
export function findScraper(query: string): ScraperMatch | null {
  const q = norm(query);
  if (!q) return null;

  for (const entry of CURATED_SCRAPERS) {
    // An exact dataset id or dataset name is the most specific thing anyone can
    // say, so it is answered first and it fixes the dataset as well as the card.
    const dataset = entry.datasets.find((d) => norm(d.id) === q || norm(d.name) === q);
    if (dataset) return { entry, dataset };
  }

  for (const entry of CURATED_SCRAPERS) {
    if (q === norm(entry.id) || q === norm(entry.name) || q === norm(entry.site)
      // `linkedin` should reach `linkedin.com`, and `x` should not reach
      // `x.com` by being one character of it -- so the site is matched with its
      // TLD dropped, not by substring.
      || q === norm(entry.site.replace(/\.[a-z.]+$/i, ''))) {
      // `datasets[0]` rather than a second lookup by `datasetId`: they are the
      // same entry by construction and `assertCurated` refuses a card where
      // they are not.
      return { entry, dataset: entry.datasets[0]! };
    }
  }

  return null;
}

/**
 * The invariants a curated card must hold, as one throwing check.
 *
 * A MODULE-LOAD ASSERTION rather than only a test, because the cost of getting
 * one of these wrong is an operator spending Bright Data credit on a card that
 * cannot work, and this file is edited by hand every time a brand is added. A
 * test catches it in CI; this catches it the first time anyone imports the
 * module. The three rules are cheap and total, over twenty-eight entries.
 */
function assertCurated(): void {
  const seen = new Set<string>();
  for (const s of SCRAPERS) {
    if (seen.has(s.id)) throw new Error(`two scraper cards share the id ${s.id}`);
    seen.add(s.id);

    if (s.datasetId === null) {
      if (s.datasets.length) throw new Error(`${s.id} has no default but offers datasets`);
      continue;
    }
    // The default has to BE the first choice, not merely agree with one, or the
    // select would open on a dataset other than the one a bare Run would use.
    if (s.datasets[0]?.id !== s.datasetId) {
      throw new Error(`${s.id}: datasetId ${s.datasetId} is not the first of its datasets`);
    }
    for (const d of s.datasets) {
      // Everything here is put into a URL Assay then calls, so it passes the
      // same guard an id arriving from a browser does. A typo in this file is
      // caught here rather than as a 404 on somebody's screen.
      if (!DatasetId.safeParse(d.id).success) {
        throw new Error(`${s.id}: ${d.id} is not shaped like a dataset_id`);
      }
    }
  }
}

/**
 * A dataset_id, validated because it goes into a URL Assay then calls.
 *
 * Bright Data has never documented the grammar, so this is the loosest rule
 * that is still a rule: the `gd_` prefix every confirmed id carries, then
 * lowercase alphanumerics. It exists to stop a query string or a path traversal
 * arriving from a browser and being appended to an api.brightdata.com URL, not
 * to predict what Bright Data will mint next. An id this refuses that is
 * genuinely valid is a bug worth a one-line fix; an id this accepts that is
 * hostile is a hole.
 */
export const DatasetId = z.string().regex(/^gd_[a-z0-9]+$/, 'a dataset_id looks like gd_l1vikfch901nx3by4');

/** A failure with the HTTP status to report, shaped like `DeliveryError`. */
export class ScrapeError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
  }
}

/**
 * The most a scrape response may be.
 *
 * `brightdata.ts` bounds an inbound delivery at 64 MiB because a gzip bomb is
 * cheap to send. This is the same reasoning pointed outwards: the response to
 * this request is bytes from a third party arriving on a worker thread, and one
 * profile record is kilobytes. 8 MiB is the same ceiling `src/skills/page.ts`
 * puts on a fetched page, which keeps the two sources of a document bounded the
 * same way, and it is three orders of magnitude above any real record.
 */
const MAX_BYTES = 8 * 1024 * 1024;

/** A slow endpoint must not pin a worker. Per request, not per `scrape` call. */
const TIMEOUT_MS = 90_000;

/**
 * How many times the snapshot's progress is polled before giving up, and how
 * long between polls.
 *
 * The sync endpoint already spent a minute on this job before handing back a
 * snapshot id, so the work is genuinely slow and a tight loop would only add
 * requests. Twenty polls five seconds apart is a hundred seconds -- enough for
 * the common case of a job that just overran the sync window, and bounded so a
 * job that is never going to finish fails with a sentence rather than holding a
 * worker until something else times out.
 */
const POLL_ATTEMPTS = 20;
const POLL_MS = 5_000;

const API = 'https://api.brightdata.com/datasets/v3';

/**
 * The token, by the name this repo already uses.
 *
 * `./config.ts` documents `BRIGHTDATA_API_TOKEN` as the variable that lets
 * ASSAY CALL BRIGHT DATA, as opposed to the delivery secret in the config file
 * that lets Bright Data call Assay. This is the calling half, so it is the same
 * variable, and introducing a second name would recreate the exact bug that
 * comment was written about -- two surfaces disagreeing about one credential.
 */
function token(): string {
  const t = process.env.BRIGHTDATA_API_TOKEN;
  if (!t) {
    throw new ScrapeError(
      503, 'no_token',
      'BRIGHTDATA_API_TOKEN is not set, so Assay cannot ask Bright Data for a record. '
      + 'Set it in the environment this process reads.',
    );
  }
  return t;
}

/**
 * The body, or a refusal -- never a truncated one.
 *
 * The same shape as `readCapped` in `src/skills/page.ts` and for the same
 * reason: `content-length` is the cheap check and also the obvious lie, so the
 * bytes actually read are counted too and the stream is cancelled the moment it
 * goes over. Returning what was read so far would hand a half-parsed record to
 * the engine, and a record missing half its keys reads downstream as a page
 * where half the fields disappeared.
 */
async function readCapped(res: Response, what: string): Promise<string> {
  const declared = Number(res.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_BYTES) {
    throw new ScrapeError(
      413, 'too_large',
      `${what} declares ${declared} bytes; Assay reads at most ${MAX_BYTES}.`,
    );
  }
  if (!res.body) return '';

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let out = '';
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BYTES) {
      await reader.cancel();
      throw new ScrapeError(
        413, 'too_large',
        `${what} sent more than ${MAX_BYTES} bytes; Assay stopped reading.`,
      );
    }
    out += decoder.decode(value, { stream: true });
  }
  return out + decoder.decode();
}

async function call(url: string, init: RequestInit, what: string): Promise<unknown> {
  // Read OUTSIDE the try. Inside, a missing token would be caught by the catch
  // below and reported as "the endpoint did not answer" -- an unset variable
  // dressed up as an outage, which is the same shape of misleading-but-true
  // report `./config.ts` was fixed for.
  const auth = `Bearer ${token()}`;

  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: { ...init.headers, authorization: auth },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    // A 502 rather than a 500: the request Assay made did not come back, which
    // is a statement about the upstream and not about this process. The token
    // is never in the message -- only the endpoint and what went wrong.
    throw new ScrapeError(502, 'unreachable', `${what} did not answer: ${(e as Error).message}`);
  }

  const text = await readCapped(res, what);

  if (!res.ok && res.status !== 202) {
    // Bright Data's own error string when there is one, truncated, because it
    // is the only thing that says WHICH of the many reasons a dataset call
    // fails this was -- a bad dataset_id and an exhausted quota are both 400s.
    throw new ScrapeError(
      res.status, 'upstream',
      `${what} answered ${res.status}${text ? `: ${text.slice(0, 400)}` : ''}`,
    );
  }

  if (!text.trim()) {
    // A 200 with no bytes is a failure and saying so is the point. It must not
    // become an empty record that then reads as "every field disappeared" --
    // the same failure `viaFirecrawl` refuses in `src/skills/page.ts`.
    throw new ScrapeError(502, 'empty', `${what} answered ${res.status} with an empty body`);
  }

  try {
    return JSON.parse(text);
  } catch (e) {
    throw new ScrapeError(502, 'unparseable', `${what} did not answer JSON: ${(e as Error).message}`);
  }
}

/**
 * The first record out of a scrape or snapshot body.
 *
 * Both endpoints answer with an array of records when they answer with records
 * at all, and this asks for one URL, so the first element is the record for
 * that URL. An array that is empty means the scraper ran and found nothing,
 * which is a real answer about the operator's URL and not something to paper
 * over with an empty object.
 */
function recordFrom(parsed: unknown, what: string): Record<string, unknown> {
  const rows = Array.isArray(parsed) ? parsed : [parsed];
  const first = rows[0];
  if (typeof first !== 'object' || first === null || Array.isArray(first)) {
    throw new ScrapeError(502, 'not_a_record', `${what} answered ${JSON.stringify(parsed).slice(0, 200)}`);
  }
  const row = first as Record<string, unknown>;
  if (!Object.keys(row).length) {
    throw new ScrapeError(422, 'empty_record', `${what} answered a record with no fields`);
  }
  // Bright Data reports a per-row failure as a row, not as a status -- a URL it
  // could not collect comes back as `{"warning": ..., "error": ...}`. Ingesting
  // that would publish an error message as though it were a profile.
  if (typeof row.error === 'string' && row.error) {
    throw new ScrapeError(422, 'row_error', `Bright Data could not collect that URL: ${row.error}`);
  }
  return row;
}

/** Bounded sleep, so the poll loop is readable as a loop. */
const wait = (ms: number): Promise<void> => new Promise((r) => { setTimeout(r, ms); });

/**
 * Wait out a job that overran the sync window, then download it.
 *
 * POLLING RATHER THAN FAILING because both endpoints are documented and were
 * read (`monitor-progress` and `download-snapshot`, cited at the top). A
 * `failed` or `canceled` status is reported as itself rather than retried: they
 * are terminal, and looping on one would turn a job Bright Data has given up on
 * into a hundred seconds of waiting for the operator.
 */
async function awaitSnapshot(snapshotId: string): Promise<Record<string, unknown>> {
  for (let i = 0; i < POLL_ATTEMPTS; i++) {
    await wait(POLL_MS);
    const p = await call(`${API}/progress/${encodeURIComponent(snapshotId)}`, { method: 'GET' }, 'the snapshot progress endpoint') as { status?: unknown };
    const status = typeof p.status === 'string' ? p.status : '';

    if (status === 'ready') {
      const body = await call(
        `${API}/snapshot/${encodeURIComponent(snapshotId)}?format=json`,
        { method: 'GET' },
        'the snapshot download endpoint',
      );
      return recordFrom(body, 'the snapshot download endpoint');
    }
    if (status === 'failed' || status === 'canceled') {
      throw new ScrapeError(
        502, `snapshot_${status}`,
        `Bright Data reports snapshot ${snapshotId} as ${status}. Nothing was collected.`,
      );
    }
    // starting / running: keep waiting. Anything else is undocumented, and
    // waiting on it is the same as waiting on `running` -- the attempt cap ends
    // it either way, with a message naming what was last seen.
  }

  throw new ScrapeError(
    504, 'snapshot_timeout',
    `Bright Data moved this request to a snapshot (${snapshotId}) and it was still not ready after `
    + `${(POLL_ATTEMPTS * POLL_MS) / 1000}s. The job is still running on their side: the results stay `
    + 'available for 16 days, so run this again in a few minutes, or trigger the scraper with a webhook '
    + 'pointed at this instance and let Bright Data deliver it.',
  );
}

/**
 * One URL through one prebuilt scraper, as a structured record.
 *
 * Sync first, because it is one request and usually answers. The 202 branch is
 * not an error path -- it is the documented behaviour of the endpoint after a
 * minute -- so it is handled rather than reported.
 */
export async function scrape(datasetId: string, url: string): Promise<Record<string, unknown>> {
  const id = DatasetId.safeParse(datasetId);
  if (!id.success) throw new ScrapeError(400, 'bad_dataset', id.error.issues[0]!.message);

  const what = `Bright Data's scrape endpoint for ${id.data}`;
  const body = await call(
    `${API}/scrape?dataset_id=${encodeURIComponent(id.data)}&format=json`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify([{ url }]),
    },
    what,
  );

  // The fallback, detected by SHAPE rather than by status. A 202 is what the
  // docs describe, but the same body arriving with a 200 is the same fact, and
  // a `snapshot_id` where a record should be is unambiguous: no documented
  // scraper record carries that key.
  const snapshotId = !Array.isArray(body) && typeof body === 'object' && body !== null
    ? (body as { snapshot_id?: unknown }).snapshot_id
    : undefined;
  if (typeof snapshotId === 'string' && snapshotId) return awaitSnapshot(snapshotId);

  return recordFrom(body, what);
}

/**
 * The field names to offer for a record nobody has documented.
 *
 * Only for the operator-supplied-dataset card, and only over keys that are
 * actually watchable -- a path `fieldNameFor` refuses is not offered rather
 * than offered and then refused by `createTarget` at the last step, which would
 * cost the operator the fields that did work. Capped, because a record with two
 * hundred keys would otherwise render two hundred checkboxes.
 */
export function fieldsFromRecord(record: Record<string, unknown>, limit = 12): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const path of Object.keys(record).sort()) {
    const v = record[path];
    // Scalars only. A nested object's leaves are watchable through the named
    // cards, which cite a documented shape; guessing which leaf of an
    // undocumented object matters is not something to do on the operator's
    // behalf.
    if (v !== null && typeof v === 'object') continue;
    const name = fieldNameFor(path);
    if (!name || seen.has(name)) continue;
    seen.add(name);
    out.push(path);
    if (out.length >= limit) break;
  }
  return out;
}

// --- the live catalogue ------------------------------------------------------
//
// `GET https://api.brightdata.com/datasets/list` -- same bearer as everything
// else in this file -- answers with the account's whole inventory of prebuilt
// scrapers as `[{id, name, size?}]`. 1,744 entries when this was written.
//
// WHY IT IS FETCHED RATHER THAN COMMITTED. A checked-in copy of 1,744 rows is a
// hundred kilobytes of third-party product names that goes stale the first time
// Bright Data ships a scraper, and there is no way to tell a stale copy from a
// current one by looking at it. The curated cards above are a deliberate
// snapshot and are pinned by a test that re-fetches this list; the SEARCH is
// meant to reach everything, which means it has to ask.
//
// AND WHY IT NEVER REACHES THE BROWSER. `searchDatasets` runs on the server and
// returns matches, so what crosses the wire is the handful of rows the operator
// asked for. Shipping the list would put a hundred kilobytes into every page
// load to answer a question most visits never ask.

/** One entry exactly as `/datasets/list` returns it. */
export interface CatalogueEntry {
  id: string;
  name: string;
  /** Rows in the dataset, when Bright Data reports one. Most entries have none. */
  size?: number;
}

/**
 * How long a fetched catalogue is reused, and the reasoning rather than a
 * round number.
 *
 * This list changes when Bright Data adds or renames a scraper, which is a
 * product release and happens on the order of weeks. It does not change because
 * an operator typed another character into a search box. Six hours means at
 * most four requests a day from a running instance, a scraper added this
 * morning is searchable this evening, and a restart re-reads it anyway -- the
 * cache is a module variable, so it dies with the process.
 *
 * The floor on this is not politeness, it is that the alternative is a request
 * to a third party per keystroke, which is how a search box becomes a rate
 * limit. The ceiling is that a dataset nobody can find is a dataset that does
 * not exist as far as the operator is concerned.
 */
const CATALOGUE_TTL_MS = 6 * 60 * 60 * 1000;

let cached: { at: number; entries: CatalogueEntry[] } | null = null;

/** The shape `/datasets/list` promises. An entry missing `id` or `name` is
 *  dropped rather than rendered as `undefined` in a list of real ones. */
const CatalogueRow = z.object({
  id: z.string().min(1),
  name: z.string(),
  size: z.number().optional(),
});

/**
 * The whole catalogue, fetched at most every `CATALOGUE_TTL_MS`.
 *
 * A FAILED FETCH DOES NOT POISON THE CACHE and does not return an empty list.
 * It throws, because "Bright Data did not answer" and "Bright Data has no
 * scrapers" are different facts and a search box that silently shows nothing
 * has told the operator the second when the first was true. That is the same
 * refusal `readCapped` makes about a truncated body.
 */
export async function listDatasets(now = Date.now()): Promise<CatalogueEntry[]> {
  if (cached && now - cached.at < CATALOGUE_TTL_MS) return cached.entries;

  const body = await call(
    'https://api.brightdata.com/datasets/list',
    { method: 'GET' },
    "Bright Data's dataset list endpoint",
  );
  if (!Array.isArray(body)) {
    throw new ScrapeError(
      502, 'not_a_list',
      `Bright Data's dataset list endpoint answered ${JSON.stringify(body).slice(0, 200)}`,
    );
  }

  const entries = body.flatMap((row) => {
    const p = CatalogueRow.safeParse(row);
    return p.success ? [p.data] : [];
  });
  cached = { at: now, entries };
  return entries;
}

/** Drops the cache, so a test can drive `listDatasets` twice without waiting
 *  six hours. Not called by the app. */
export const forgetCatalogue = (): void => { cached = null; };

/**
 * The names that mean "this is somebody's scratch dataset".
 *
 * WHY THIS EXISTS. Of 1,744 entries a few dozen are named `test`, `Test`,
 * `need_to_edit`, `delete please`, `TEST IGNORE`, `Preview URL test - Remove
 * me!`. They are real dataset_ids -- they would run -- but nobody outside the
 * account that made them can tell what they collect, and seven identical rows
 * reading `test` in a search result is worse than no result.
 *
 * EACH PATTERN IS ANCHORED OR DELIMITED, which is the difference between a
 * filter and a censor. Bare `/test/` would hide `Fastest delivery products`;
 * bare `/delete/` would hide nothing real but sets the wrong precedent. So the
 * word has to stand alone, or sit in the brackets and parentheses these names
 * actually use: `[delete]`, `(delete)`, `- test`, `[TEST]`.
 *
 * `internal` IS IN THE LIST AND `preview` IS NOT. `TikTok posts [internal use]`
 * is explicitly marked as not for outside consumption by whoever named it;
 * `preview` appears in `Preview URL test - Remove me!`, which the `test` rule
 * already catches, and would otherwise hide a legitimate preview scraper.
 *
 * THE FILTER IS NEVER SILENT. `searchDatasets` returns `hidden` alongside the
 * matches and the screen says the number. A silent filter is the same defect as
 * a silent truncation: it makes the product's answer smaller than the truth
 * without saying so, which is the failure the rest of this codebase is built to
 * refuse.
 */
const JUNK = [
  /(^|[\s\-([])tests?([\s\-)\]]|$)/i,
  /(^|[\s\-([])(delete|deleted|remove|removed)([\s\-)\]!]|$)/i,
  /\bdelete\s+please\b/i,
  /\bneed[_\s]to[_\s]edit\b/i,
  /(^|[\s\-([])internal([\s\-)\]]|$)/i,
  /\bdeprecated\b/i,
  /\bignore\b/i,
  /\bnot relevant\b/i,
  /\bold version\b/i,
  /\bdummy\b/i,
  /^\s*$/,
];

/** Whether an entry's name marks it as somebody's scratch dataset. */
export const isJunkName = (name: string): boolean => JUNK.some((p) => p.test(name));

export interface DatasetSearch {
  matches: CatalogueEntry[];
  /** How many entries the whole catalogue holds. */
  total: number;
  /** How many junk-named entries the catalogue holds, whether or not they
   *  matched. The screen reports this so the filter is visible. */
  hidden: number;
  /** How many entries matched but are not in `matches`, because of `limit`. */
  more: number;
}

/**
 * Every dataset whose name matches, junk excluded, best first.
 *
 * THE RANK IS THREE RULES AND NO SCORE. An exact name wins, then a name that
 * starts with the query, then everything else by name. A weighted relevance
 * score would be a number this file cannot justify -- there is no corpus of
 * dataset searches to fit it against -- and the honest version of "we do not
 * know how relevant these are" is alphabetical.
 *
 * MATCHING IS ON THE NAME ONLY, and the id is matched exactly. An operator who
 * pastes `gd_l1vikfch901nx3by4` is naming one dataset, not searching, and gets
 * that one back; substring-matching ids would return the entries whose random
 * suffix happened to contain those characters, which is noise dressed as a hit.
 */
export async function searchDatasets(
  query: string,
  limit = 25,
  now = Date.now(),
): Promise<DatasetSearch> {
  const all = await listDatasets(now);
  const hidden = all.filter((e) => isJunkName(e.name)).length;
  const q = query.trim().toLowerCase();
  if (!q) return { matches: [], total: all.length, hidden, more: 0 };

  const hits = all.filter((e) =>
    !isJunkName(e.name) && (e.id.toLowerCase() === q || e.name.toLowerCase().includes(q)));

  hits.sort((a, b) => {
    const an = a.name.toLowerCase();
    const bn = b.name.toLowerCase();
    return (bn === q ? 1 : 0) - (an === q ? 1 : 0)
      || (bn.startsWith(q) ? 1 : 0) - (an.startsWith(q) ? 1 : 0)
      || an.localeCompare(bn);
  });

  return {
    matches: hits.slice(0, limit),
    total: all.length,
    hidden,
    more: Math.max(0, hits.length - limit),
  };
}

// At the bottom, not beside `assertCurated`: it reads `DatasetId`, which is
// declared further down this file, and calling it any earlier is a temporal dead
// zone rather than a check.
assertCurated();
