// Pull historical captures of each target from the Wayback Machine.
// This corpus is the fuel for the benchmark (PLAN.md 12).
//
// Two traps this defends against, both hit for real during site selection:
//   1. Captures MUST be fetched with the `id_` suffix. Without it the Internet
//      Archive serves REWRITTEN html with an injected toolbar and JS, which
//      corrupts every fingerprint and skeleton hash computed from it -- silently.
//   2. IA returns soft failures as HTTP 200 with an html body ("Temporarily
//      Offline"). raise-for-status sails straight past it.

import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { SITES } from '../src/sites.js';

const UA = 'assay-research/0.1 (hackathon; contact via github)';
const OUT = path.resolve('corpus');
const FROM = '2024';
const TO = '2026';

const sleep = (ms: any) => new Promise((r) => setTimeout(r, ms));

// IA soft-failures are HTTP 200 with an html body. Status alone proves nothing.
function isSoftFail(body: any) {
  if (!body || body.length < 200) return true;
  const head = body.slice(0, 3000).toLowerCase();
  return (
    head.includes('internet archive: temporarily offline') ||
    head.includes('the wayback machine has not archived that url') ||
    head.includes('too many requests')
  );
}

async function get(url: any, { tries = 3 } = {}) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, {
        headers: { 'user-agent': UA, accept: 'text/html,application/json' },
        signal: AbortSignal.timeout(45_000),
      });
      const body = await res.text();
      if (res.status === 429 || res.status >= 500) throw new Error(`http ${res.status}`);
      return { status: res.status, body };
    } catch (err) {
      if (i === tries - 1) return { status: 0, body: '', error: String(err) };
      await sleep(1500 * (i + 1)); // linear backoff; IA recovers in minutes, not ms
    }
  }
}

async function captures(url: any) {
  const q = new URLSearchParams({
    url,
    output: 'json',
    from: FROM,
    to: TO,
    collapse: 'timestamp:6', // one per month -- enough churn without hammering IA
    fl: 'timestamp,original,digest',
    limit: '80',
  });
  // repeatable filters cannot go through URLSearchParams cleanly
  const api =
    `https://web.archive.org/cdx/search/cdx?${q}` +
    `&filter=statuscode:200&filter=mimetype:text/html`;

  // `!`: the retry loop always returns on its final iteration.
  const { body } = (await get(api))!;
  if (!body.trimStart().startsWith('[')) return []; // soft-fail, not json
  const rows = JSON.parse(body).slice(1); // row 0 is a HEADER, not data
  return rows.map(([timestamp, original, digest]: any[]) => ({ timestamp, original, digest }));
}

async function main() {
  const manifest: any[] = [];
  for (const site of SITES) {
    const dir = path.join(OUT, site.id);
    await mkdir(dir, { recursive: true });

    const caps = await captures(site.url);
    console.log(`\n${site.name}: ${caps.length} monthly captures`);
    if (!caps.length) {
      console.log('  ! no captures -- IA may be flapping, re-run');
      continue;
    }

    const seen = new Set();
    let ok = 0;
    for (const cap of caps) {
      // identical digest == byte-identical page. Nothing to learn, skip the fetch.
      if (seen.has(cap.digest)) continue;
      seen.add(cap.digest);

      const file = path.join(dir, `${cap.timestamp}.html`);
      if (existsSync(file)) {
        manifest.push({ site: site.id, ...cap, file, cached: true });
        ok++;
        continue;
      }

      // the id_ suffix is load-bearing -- see header comment
      const raw = `https://web.archive.org/web/${cap.timestamp}id_/${cap.original}`;
      const { status, body } = (await get(raw))!;
      if (status !== 200 || isSoftFail(body)) {
        console.log(`  skip ${cap.timestamp} (status ${status}, soft-fail ${isSoftFail(body)})`);
        await sleep(800);
        continue;
      }
      await writeFile(file, body);
      manifest.push({ site: site.id, ...cap, file, bytes: body.length });
      ok++;
      process.stdout.write('.');
      await sleep(700); // be a good citizen; IA rate-limits fast
    }
    console.log(`\n  saved ${ok}/${caps.length}`);
  }

  await writeFile(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(`\nmanifest: ${manifest.length} captures across ${SITES.length} sites`);
}

main();
