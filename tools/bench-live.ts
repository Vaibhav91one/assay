// THE LIVE ARM. The same gate, the same mutations, on pages nobody chose.
//
//   node tools/bench-live.js [--refetch] [--tau 0.6] [--delta 0.16]
//
// `npm run bench` grades 153 cases built from Wayback snapshots. That corpus is
// reproducible forever, which is exactly why it is also the weaker evidence: the
// snapshots were picked, by us, from an archive, before the scorer was written.
// A reader is entitled to ask whether the gate holds on a page we did not choose.
// This answers that question and nothing else. It does NOT replace the archived
// number, and it is not the headline: three pages is three pages.
//
// TWO RULES, both learned the hard way.
//
// 1. It grades through `tools/bench-core.ts`. Not a copy of it. `tools/sweep.ts`
//    once kept its own transcription of the gate's arithmetic and drifted into
//    reporting 3 wrong values where bench reported zero -- it was grading a
//    healer that does not exist. One implementation, or this file is fiction.
//
// 2. It caches. A live page is rewritten under you, so an uncached live
//    benchmark is not reproducible by anyone, including the person who ran it --
//    the number would be a claim about a page that no longer exists. The fetched
//    HTML is committed under `corpus-live/`, so a reviewer with no Bright Data
//    account re-runs these exact numbers with `npm run bench:live`. `--refetch`
//    is the only thing that spends credits, and it deliberately changes the
//    dataset: the date in the manifest is part of the result.

import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { MUTATIONS } from '../src/mutate.js';
import { grade, report, type Capture } from './bench-core.js';

const argv = process.argv.slice(2);
const flag = (n: string) => argv.includes(`--${n}`);
const arg = (name: string, dflt: number): number => {
  const i = argv.indexOf(`--${name}`);
  return i > -1 ? Number(argv[i + 1]) : dflt;
};
const TAU = arg('tau', 0.6);
const DELTA = arg('delta', 0.16);
const REFETCH = flag('refetch');

// The live originals of the three corpus sites, confirmed against
// `corpus/manifest.json`. Same pages, no archive in between.
const SITES: Record<string, string> = {
  mattel: 'https://service.mattel.com/us/recall.aspx',
  ikea: 'https://www.ikea.com/us/en/customer-service/product-support/recalls/',
  chicco: 'https://www.chiccousa.com/child-safety/product-recalls/',
};

// Web Unlocker, one request per page, raw HTML back in the response body.
// https://docs.brightdata.com/scraping-automation/web-unlocker/send-your-first-request
const UNLOCKER = 'https://api.brightdata.com/request';
const ZONE = 'cli_unlocker';
const DIR = 'corpus-live';
const MANIFEST = `${DIR}/manifest.json`;

/** Same shape as `corpus/manifest.json`, with the page's own digest as `digest`.
 *  `file` is repo-relative on purpose: this file is committed, and an absolute
 *  path in a committed manifest is a path to one developer's laptop. */
interface Entry {
  site: string;
  timestamp: string;   // ISO instant of the fetch, not of the page
  original: string;
  digest: string;      // sha256 of the bytes in `file`
  file: string;
  bytes: number;
  zone: string;
}

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
const today = () => new Date().toISOString().slice(0, 10);

/** One Bright Data request. Costs credits; called only when the cache misses. */
async function unlock(url: string, token: string): Promise<string> {
  const res = await fetch(UNLOCKER, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ zone: ZONE, url, format: 'raw' }),
    signal: AbortSignal.timeout(120_000),
  });
  const body = await res.text();
  // The token never appears in a response, but this text is about to be written
  // to a committed file, and "verbatim" plus "secret" is how credentials reach a
  // repo. Cheap enough to be certain (same guard as tools/bd-heal.ts).
  if (body.includes(token)) throw new Error('refusing to cache a response containing the token');
  if (!res.ok) throw new Error(`bright data ${res.status}: ${body.slice(0, 200)}`);
  if (!body.trim()) throw new Error(`bright data returned an empty body for ${url}`);
  return body;
}

/** Newest cached capture for a site, or null. Filenames are dates, so sorted. */
async function newest(site: string): Promise<string | null> {
  const files = (await readdir(`${DIR}/${site}`).catch(() => [] as string[]))
    .filter((f) => f.endsWith('.html')).sort();
  return files.at(-1) ?? null;
}

const run = async () => {
  const manifest: Entry[] = JSON.parse(await readFile(MANIFEST, 'utf8').catch(() => '[]'));
  const captures: Capture[] = [];
  const used: Entry[] = [];
  let requests = 0;

  for (const [site, url] of Object.entries(SITES)) {
    const cached = REFETCH ? null : await newest(site);

    if (cached) {
      const file = `${DIR}/${site}/${cached}`;
      const html = await readFile(file, 'utf8');
      // The manifest is the record of the fetch; the file is the evidence. If
      // they disagree the manifest is the thing that is wrong, so it is rebuilt
      // from the bytes rather than trusted over them.
      const known = manifest.find((e) => e.file === file);
      used.push({
        site,
        timestamp: known?.timestamp ?? `${cached.replace('.html', '')}T00:00:00.000Z`,
        original: url,
        digest: sha256(html),
        file,
        bytes: Buffer.byteLength(html),
        zone: known?.zone ?? ZONE,
      });
      captures.push({ site, capture: cached.replace('.html', ''), html });
      continue;
    }

    // Cache miss. This is the only path that needs a token, and it is the only
    // path that can fail for want of one -- so the check lives here, where the
    // message can say which of the two situations the reader is in.
    const token = process.env.BRIGHTDATA_API_TOKEN;
    if (!token) {
      console.error(
        `\nerror: BRIGHTDATA_API_TOKEN is not set, and ${site} has no cached page under ${DIR}/.\n` +
          '  A run over the committed cache needs no token; fetching a new page does.\n' +
          '  export BRIGHTDATA_API_TOKEN=...   (Bright Data control panel)\n\n' +
          '  Refusing to grade the sites that ARE cached and call it a live benchmark.\n' +
          '  A benchmark that reports success over a short set is the failure this\n' +
          '  project exists to name.\n'
      );
      process.exit(2);
    }

    console.error(`fetching ${site} through bright data (${ZONE}) ...`);
    const html = await unlock(url, token);
    requests++;
    const file = `${DIR}/${site}/${today()}.html`;
    await mkdir(`${DIR}/${site}`, { recursive: true });
    await writeFile(file, html);
    console.error(`  ${Buffer.byteLength(html)} bytes -> ${file}`);

    used.push({
      site, timestamp: new Date().toISOString(), original: url,
      digest: sha256(html), file, bytes: Buffer.byteLength(html), zone: ZONE,
    });
    captures.push({ site, capture: today(), html });
  }

  if (requests) {
    // Entries for pages still on disk but not used by this run stay put; a
    // manifest that forgets an older capture makes it unverifiable.
    const kept = manifest.filter((e) => !used.some((u) => u.file === e.file));
    await writeFile(MANIFEST, JSON.stringify([...kept, ...used]
      .sort((a, b) => a.file.localeCompare(b.file)), null, 2) + '\n');
  }

  const result = grade(captures, { tau: TAU, delta: DELTA });
  const n = result.arms.gated.n;
  const fetched = used.map((e) => e.timestamp.slice(0, 10)).sort();

  report(result, [
    `\nASSAY BENCHMARK  -  LIVE ARM, pages fetched through bright data`,
    `sites ${Object.keys(SITES).join(', ')}  |  1 capture each  |  ${MUTATIONS.length} mutations`,
    `fetched ${fetched[0] === fetched.at(-1) ? fetched[0] : `${fetched[0]}..${fetched.at(-1)}`}` +
      `  |  zone ${ZONE}  |  n = ${n} cases`,
  ], { tau: TAU, delta: DELTA });

  // Said twice, because the number above is the one that gets quoted and the
  // sample size is the thing that makes it quotable or not.
  console.log(`\nn = ${n}. The headline 153-case number is \`npm run bench\` over the`);
  console.log('archived corpus; this is a separate, much smaller check on pages we did');
  console.log('not choose. Three pages cannot carry a rate to one decimal place -- read');
  console.log(`VALUE WRONG here as a count out of ${n}, not as a percentage.\n`);

  await mkdir('results', { recursive: true });
  await writeFile('results/bench-live.json', JSON.stringify({ ...result,
    config: { tau: TAU, delta: DELTA, sites: Object.keys(SITES), n,
              source: 'brightdata', zone: ZONE, endpoint: UNLOCKER, captures: used } }, null, 2));
  console.log(`${result.events.length} events, ${requests} bright data request(s) -> results/bench-live.json\n`);
};

run();
