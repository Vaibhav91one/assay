// One way to turn a target url into bytes, for every caller that needs one.
//
// THIS IS THE SEAM, AND IT ALREADY EXISTED. `src/runner.ts` takes `fetchPage`
// as a PARAMETER rather than importing one, which is why a Bright Data delivery
// and a local fetch go down identical detection and gating -- see
// `src/connectors/ingest.ts`. A new source that supplies those bytes therefore
// inherits the gate, the tau/delta thresholds and the measured wrong-value rate
// with no second extraction path and no weaker checks. Anything that needed a
// second path would be the wrong design, and this one does not.
//
// WHY THERE IS NOW ONE COPY. `tools/worker.ts` and `src/setup/index.ts` each
// carried their own url-to-html function, and the setup one said so in a
// comment: "Four lines rather than an import because worker.ts does not export
// its copy". Two copies were survivable while the answer was always "fetch it";
// they are not survivable once a connector can supply the bytes, because a
// connector wired into one of them would be a connector that works when you
// create a target and stops working when the worker runs it. So both now call
// here.
//
// THE DEFAULT IS UNCHANGED, DELIBERATELY. With nothing enabled -- which is every
// existing install -- this does exactly what the two copies did: read the newest
// committed capture for `corpus://`, and otherwise one ordinary fetch with the
// same user-agent. A connector is consulted only AFTER a direct request has
// already failed. That is the same shape the product already describes for
// Bright Data ("fetches pages that refuse a plain request"), and it means
// enabling one cannot change what happens on a page that was working, cannot
// route traffic somewhere the operator did not expect, and cannot cost money on
// a page a plain request can read.

import { readFile, readdir } from 'node:fs/promises';
import { enabled } from './store.js';
import { SKILLS, stateOf } from './index.js';

/** The user-agent both former copies sent. Unchanged. */
const UA = 'assay/0.1 (+self-hosted)';

/** Where the bytes came from. Recorded on the run, never guessed. */
export interface Fetched {
  html: string;
  /** A skill id from the registry -- `local-fetch`, `firecrawl`, `corpus`. */
  via: string;
}

/**
 * The newest committed capture for `corpus://site`.
 *
 * Resolved against the PACKAGE, not the process. `tools/worker.ts` used to read
 * `corpus/<site>` relative to cwd, which is the repo root when it runs; a Next
 * route's cwd is `web/`, so the same url meant two directories depending on who
 * asked. A corpus url names one page -- this is `src/setup/index.ts`'s
 * resolution, now the only one.
 */
async function fromCorpus(url: string): Promise<Fetched> {
  const site = url.slice('corpus://'.length).split('/')[0]!;
  const dir = new URL(`../../corpus/${site}/`, import.meta.url);
  const files = (await readdir(dir)).filter((f) => f.endsWith('.html')).sort();
  if (!files.length) throw new Error(`corpus/${site} holds no captures`);
  return { html: await readFile(new URL(files.at(-1)!, dir), 'utf8'), via: 'corpus' };
}

/** One ordinary request. The floor, and what every install has always done. */
async function direct(url: string): Promise<Fetched> {
  const res = await fetch(url, { headers: { 'user-agent': UA } });
  if (!res.ok) throw new Error(`fetch ${res.status}`);
  return { html: await res.text(), via: 'local-fetch' };
}

/**
 * One page through Firecrawl.
 *
 * `formats: ['rawHtml']` because Assay resolves fields against the DOM the site
 * served. Markdown would be a second, lossier document to write contracts
 * against, and every selector the fingerprinter derives would be against
 * something the site never sent -- so the one format that keeps the existing
 * pipeline honest is the unmodified HTML.
 *
 * The key is read here and passed in a header. It is not returned, not logged,
 * and not put in the error: a failure says the status and Firecrawl's own
 * `error` string, both of which are about the request rather than the
 * credential.
 */
async function viaFirecrawl(url: string): Promise<Fetched> {
  const key = process.env.FIRECRAWL_API_KEY;
  if (!key) throw new Error('FIRECRAWL_API_KEY is not set');
  const res = await fetch('https://api.firecrawl.dev/v2/scrape', {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ url, formats: ['rawHtml'] }),
  });
  const body = (await res.json().catch(() => ({}))) as {
    success?: boolean;
    data?: { rawHtml?: string };
    error?: string;
  };
  if (!res.ok) throw new Error(`firecrawl ${res.status}${body.error ? `: ${body.error}` : ''}`);
  const html = body.data?.rawHtml;
  // A 200 with no bytes is a failure, and saying so is the point of this
  // project: a green run and an empty column is the exact shape of the Bright
  // Data finding in docs/CREDENTIALS. It must not become an empty page that
  // then reads as "the field disappeared".
  if (!html) throw new Error('firecrawl returned no rawHtml');
  return { html, via: 'firecrawl' };
}

/** Every page-source connector this build can actually call, by id. */
const SOURCES: Record<string, (url: string) => Promise<Fetched>> = {
  firecrawl: viaFirecrawl,
};

/**
 * The bytes at `url`, and which source produced them.
 *
 * `enabledIds` is a parameter so a test can state the configuration it is
 * describing instead of writing a file. Absent, it is read from the store.
 */
export async function fetchHtml(url: string, enabledIds?: readonly string[]): Promise<Fetched> {
  if (url.startsWith('corpus://')) return fromCorpus(url);

  try {
    return await direct(url);
  } catch (first) {
    const ids = enabledIds ?? (await enabled());
    const fallbacks = SKILLS
      .filter((s) => s.provides === 'page-source' && !s.always && SOURCES[s.id])
      .filter((s) => stateOf(s, ids).active);
    for (const s of fallbacks) {
      try {
        return await SOURCES[s.id]!(url);
      } catch (e) {
        // A connector that also failed does not replace the original failure in
        // the operator's message: the page refusing a direct request is the
        // fact they need, and `via firecrawl: 402` alone would send them to
        // debug the wrong thing. Both are named.
        throw new Error(`${(first as Error).message} (${s.id}: ${(e as Error).message})`);
      }
    }
    throw first;
  }
}
