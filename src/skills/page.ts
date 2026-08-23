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
// already failed. Firecrawl is the only fallback wired here -- Bright Data
// reaches Assay the other way round, by POSTing a delivery to
// `src/connectors/brightdata.ts`, and nothing in this file calls it. It means
// enabling one cannot change what happens on a page that was working, cannot
// route traffic somewhere the operator did not expect, and cannot cost money on
// a page a plain request can read.

import { readFile, readdir } from 'node:fs/promises';
import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';
import { enabled } from './store.js';
import { SKILLS, stateOf } from './index.js';

/** The user-agent both former copies sent. Unchanged. */
const UA = 'assay/0.1 (+self-hosted)';

// --- the guard ----------------------------------------------------------------
//
// WHY IT IS HERE AND NOT AT THE CALLERS. The url reaching this file is typed by
// whoever is using the product: the chat's `assay_inspect`, the tracker
// library's paste-a-link box, `describeFields`, `createTarget`, the worker
// re-running a saved target. On a self-hosted box that operator already owns the
// machine and nothing is gained by stopping them. On a HOSTED instance they do
// not, and "fetch this url for me" is a request to make the server open a socket
// on their behalf -- so `http://169.254.169.254/` reads cloud instance metadata
// and hands it back through a proposal. Every one of those callers goes through
// `fetchHtml`, which is why the check is one function here rather than five
// copies that drift.
//
// WHAT IT REFUSES, AND WHY IT SAYS SO. This product's argument is that it tells
// you why it would not do something. A blocked address is not a failed fetch, it
// is a decision, and the message names the address, the range and the reason.
// The refusal is total: a redirect into a blocked range throws away the bytes
// already read rather than returning a partial page.

/**
 * A url Assay will not open at all, as opposed to one that failed to answer.
 *
 * The distinction is load-bearing in `fetchHtml`: an ordinary failure is what
 * makes it consult an enabled connector, and a refused address must NOT become
 * "then try it through Firecrawl". A decision not to make a request is not a
 * request that went badly.
 */
export class Refusal extends Error {}

/** Ranges no operator-supplied url may reach, each with the sentence it earns. */
const BLOCKED: readonly (readonly [string, readonly string[]])[] = [
  ['the loopback interface -- that is this server talking to itself', ['127.0.0.0/8', '::1/128']],
  ['this host itself', ['0.0.0.0/8', '::/128']],
  ['a private network (RFC1918)', ['10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16']],
  [
    'the link-local range, which is where cloud instance metadata lives',
    ['169.254.0.0/16', 'fe80::/10'],
  ],
  ['a unique-local IPv6 network', ['fc00::/7']],
  ['carrier-grade NAT space', ['100.64.0.0/10']],
  ['multicast or reserved space', ['224.0.0.0/4', '240.0.0.0/4', 'ff00::/8']],
];

// `net.BlockList` rather than hand-rolled octet arithmetic: it is stdlib, and it
// already canonicalises the forms a hand-rolled check gets wrong -- `::ffff:
// 127.0.0.1` and `0:0:0:0:0:ffff:7f00:1` are both loopback to it, and both are
// how you smuggle 127.0.0.1 past a regex.
const BLOCKS = BLOCKED.map(([why, cidrs]) => {
  const list = new BlockList();
  for (const cidr of cidrs) {
    const [addr, bits] = cidr.split('/');
    list.addSubnet(addr!, Number(bits), isIP(addr!) === 6 ? 'ipv6' : 'ipv4');
  }
  return [why, list] as const;
});

/** The sentence naming why this address is refused, or null if it is reachable. */
function whyBlocked(ip: string): string | null {
  const type = isIP(ip) === 6 ? 'ipv6' : 'ipv4';
  for (const [why, list] of BLOCKS) if (list.check(ip, type)) return why;
  return null;
}

/** How many hops a redirect chain gets before Assay stops following it. */
const MAX_REDIRECTS = 5;
/** A slow host must not be able to pin a worker or a request thread. */
const TIMEOUT_MS = 15_000;
/** A page larger than this is not a page Assay was going to read fields off. */
const MAX_BYTES = 8 * 1024 * 1024;

/**
 * Refuse `u` unless it names a public address, RESOLVING THE NAME FIRST.
 *
 * Checking the string is not a check: `localhost`, `metadata.google.internal`
 * and any attacker-owned name with an A record of `169.254.169.254` all pass a
 * string test and all reach the server's own network. So the hostname is
 * resolved and EVERY address it resolves to is checked -- one public answer does
 * not excuse a private one alongside it.
 *
 * DNS REBINDING, AND WHAT THIS DELIBERATELY DOES NOT DO. `fetch` resolves the
 * name again when it connects, so a record with a one-second TTL can answer
 * public here and private there. Closing that needs the socket pinned to the
 * address this function actually saw -- an undici dispatcher with a custom
 * `connect.lookup`, which means taking a direct dependency on undici (it is a
 * transitive one today, not declared) and hand-rolling connection pooling and
 * TLS servername for every outbound request. That is a large, permanent piece of
 * machinery, and it is aimed at an attacker who controls a DNS zone and times a
 * flip inside a few milliseconds. The threat this guard exists for is an
 * OPERATOR on a hosted instance pointing Assay at the metadata endpoint, and
 * that operator does not control a nameserver. So: the window is known, it is
 * named here, and the cost of closing it is not paid yet. If Assay ever fetches
 * urls that arrive from somewhere other than the person who typed them, this is
 * the comment to come back to.
 */
async function assertReachable(u: URL): Promise<void> {
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new Refusal(`Assay only fetches http and https URLs, and that one is ${u.protocol}//`);
  }

  // `URL.hostname` keeps the brackets on an IPv6 literal; `isIP` wants them off.
  const host = u.hostname.replace(/^\[|\]$/g, '');

  let addresses: string[];
  if (isIP(host)) addresses = [host];
  else {
    try {
      addresses = (await lookup(host, { all: true })).map((a) => a.address);
    } catch {
      throw new Refusal(`${host} does not resolve to any address.`);
    }
  }

  for (const address of addresses) {
    const why = whyBlocked(address);
    if (why) {
      // Named in full, because the operator has to be able to tell this apart
      // from the site being down. If the name resolved to something other than
      // itself, say both -- "assay.internal is 10.0.0.5" is the whole
      // explanation, and hiding the address would make it a mystery.
      const what = host === address ? address : `${host}, which resolves to ${address},`;
      throw new Refusal(
        `refusing to fetch ${u.origin}: ${what} is on ${why}. `
        + 'Assay will not open connections to addresses on the machine it runs on '
        + 'or the network around it.',
      );
    }
  }
}

/**
 * The body, or a refusal -- never a truncated page.
 *
 * Both halves matter. `content-length` is the cheap check and it is also the
 * obvious lie, so the bytes actually read are counted too and the stream is
 * cancelled the moment it goes over. Throwing rather than returning what was
 * read so far is the point: a page cut in half is a page whose fields have
 * silently disappeared, which is the exact failure this whole product exists to
 * refuse to ship.
 */
async function readCapped(res: Response, url: URL): Promise<string> {
  const declared = Number(res.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_BYTES) {
    throw new Error(`${url.origin} declares ${declared} bytes; Assay reads at most ${MAX_BYTES}.`);
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
      throw new Error(`${url.origin} sent more than ${MAX_BYTES} bytes; Assay stopped reading.`);
    }
    out += decoder.decode(value, { stream: true });
  }
  return out + decoder.decode();
}

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

/**
 * One ordinary request. The floor, and what every install has always done.
 *
 * `redirect: 'manual'` is the whole reason this is a loop. Letting `fetch`
 * follow redirects itself means the guard sees hop one and the socket ends up
 * wherever hop two pointed -- and `http://a-site-i-control/` returning `302
 * Location: http://169.254.169.254/` is the first thing anyone tries. So every
 * hop is re-checked before it is opened, and the chain is capped.
 */
async function direct(url: string): Promise<Fetched> {
  let target: URL;
  try {
    target = new URL(url);
  } catch {
    throw new Refusal(`${url} is not a URL Assay can fetch.`);
  }

  for (let hop = 0; ; hop++) {
    await assertReachable(target);
    const res = await fetch(target, {
      headers: { 'user-agent': UA },
      redirect: 'manual',
      // Total budget for one hop. A host that accepts the connection and then
      // says nothing is the cheapest way to hold a worker forever.
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    const location = res.status >= 300 && res.status < 400 ? res.headers.get('location') : null;
    if (location) {
      if (hop >= MAX_REDIRECTS) {
        throw new Error(`${url} redirected more than ${MAX_REDIRECTS} times; Assay stopped following.`);
      }
      target = new URL(location, target);
      continue;
    }

    if (!res.ok) throw new Error(`fetch ${res.status}`);
    return { html: await readCapped(res, target), via: 'local-fetch' };
  }
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
    // A refused address is the end of the answer. Falling through here would
    // turn "Assay will not open connections to that network" into "Assay will
    // not, but it will ask Firecrawl to" -- and it would replace a sentence the
    // operator can act on with a connector's own error about the same url.
    if (first instanceof Refusal) throw first;

    const ids = enabledIds ?? (await enabled());
    const fallbacks = SKILLS
      .filter((s) => !s.always && SOURCES[s.id])
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
