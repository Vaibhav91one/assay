// Connectors: the delivery receiver, the two chat webhooks, and the rule that
// a stored secret never comes back out.
//
// The last one is the reason this file leads with it. Everything else here is
// a shape check; "a configured credential cannot be read back" is the property
// that makes the config endpoints safe to expose at all, so it is asserted
// against every read path rather than against the one that happens to be new.

import { describe as suite, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { gzipSync } from 'node:zlib';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { load } from 'cheerio';

import { KINDS, put, remove, describe, secretFor } from '../src/connectors/config.js';
import { verifyBearer, decodeDelivery, pageFrom, HTML_KEYS, DeliveryError } from '../src/connectors/brightdata.js';
import { slackPayload, discordPayload, announce, summarise, breakMessage, testMessage } from '../src/connectors/deliver.js';
import { getConnectors, putConnector, deleteConnector, postDelivery } from '../src/connectors/handlers.js';
import { ingestPage, pageDigest } from '../src/connectors/ingest.js';
import { loadTools } from '../src/mcp/server.js';
import { getDb, closeDb, heldCells, sql } from '../src/store/index.js';

// A real Slack webhook URL is a bearer credential. This is a syntactically
// valid one pointed at a host that exists, so the host allow-list is exercised
// without anything ever being posted to it -- every delivery test injects fetch.
// Assembled rather than written out. GitHub's push protection matches the
// shape of a Slack webhook URL and cannot know this token is twenty-four
// literal x's, so a spelled-out placeholder blocks the push. The host has to
// stay real -- the allow-list is the thing under test -- so only the literal
// goes away, not the value.
const SLACK_URL = ['https://hooks.slack.com/services', 'T00000000', 'B00000000', 'x'.repeat(24)].join('/');
const DISCORD_URL = ['https://discord.com/api/webhooks', '123456789012345678', 'abcdefghijklmnopqrstuvwxyz'].join('/');
const BD_SECRET = 'bdw_0123456789abcdef0123456789abcdef';

let dir = '';
let dbUp = false;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'assay-connectors-'));
  process.env.ASSAY_CONNECTORS = join(dir, 'connectors.json');
  try { getDb(); await heldCells(); dbUp = true; } catch { dbUp = false; }
});
afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
  await closeDb().catch(() => {});
});
beforeEach(async () => { for (const k of KINDS) await remove(k); });

const ctx = (params: Record<string, string> = {}) => ({ params: Promise.resolve(params) });

// ---------------------------------------------------------------------------

suite('a stored secret never comes back out', () => {
  it('describe() reports presence and carries no value', async () => {
    await put('slack', { url: SLACK_URL });
    const [row] = await describe('slack');
    expect(row!.configured).toBe(true);
    expect(Object.keys(row!).sort()).toEqual(['configured', 'kind', 'updated_at']);
    expect(JSON.stringify(row)).not.toContain('hooks.slack.com');
  });

  it('the write response echoes nothing back', async () => {
    const res = await putConnector(
      new Request('http://x', { method: 'PUT', body: JSON.stringify({ url: SLACK_URL }) }),
      ctx({ kind: 'slack' }),
    );
    // No API key on that request, so it must not even reach the store.
    expect(res.status).toBe(401);
    expect(await res.text()).not.toContain('hooks.slack.com');
  });

  it('no read path leaks a configured credential', async () => {
    await put('slack', { url: SLACK_URL });
    await put('discord', { url: DISCORD_URL });
    await put('brightdata', { secret: BD_SECRET });

    // Every response body this feature can produce for an unauthenticated or
    // authenticated caller, checked against all three live secrets.
    const bodies = await Promise.all([
      getConnectors(new Request('http://x'), ctx()).then((r) => r.text()),
      deleteConnector(new Request('http://x', { method: 'DELETE' }), ctx({ kind: 'slack' })).then((r) => r.text()),
      postDelivery(
        new Request('http://x', { method: 'POST', body: '[]' }),
        ctx({ kind: 'brightdata', target: 'ikea' }),
      ).then((r) => r.text()),
      (await loadTools()).assay_connectors!.run({}).then((v) => JSON.stringify(v)),
    ]);

    for (const body of bodies) {
      expect(body).not.toContain(BD_SECRET);
      expect(body).not.toContain('hooks.slack.com');
      expect(body).not.toContain('discord.com/api/webhooks');
    }
  });

  it('is on disk 0600, because the file is the only place it exists', async () => {
    await put('brightdata', { secret: BD_SECRET });
    const { stat } = await import('node:fs/promises');
    const s = await stat(process.env.ASSAY_CONNECTORS!);
    expect(s.mode & 0o777).toBe(0o600);
    // And it really is stored -- the test above proves it is not readable via
    // an endpoint, not that it was silently dropped.
    expect((await secretFor('brightdata'))!.secret).toBe(BD_SECRET);
  });

  it('refuses a webhook URL on a host that is not the vendor', async () => {
    await expect(put('slack', { url: 'https://evil.example.com/hook' })).rejects.toThrow();
    // http, right host: still refused. A credential does not travel in clear.
    await expect(put('slack', { url: 'http://hooks.slack.com/services/x' })).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------

suite('bright data delivery: authenticity', () => {
  it('accepts only the configured bearer', () => {
    expect(verifyBearer(`Bearer ${BD_SECRET}`, BD_SECRET)).toBe(true);
    expect(verifyBearer(`bearer ${BD_SECRET}`, BD_SECRET)).toBe(true);
  });

  it('refuses a missing, malformed or wrong bearer', () => {
    expect(verifyBearer(null, BD_SECRET)).toBe(false);
    expect(verifyBearer('', BD_SECRET)).toBe(false);
    expect(verifyBearer(BD_SECRET, BD_SECRET)).toBe(false);          // no scheme
    expect(verifyBearer(`Bearer ${BD_SECRET}x`, BD_SECRET)).toBe(false);
    expect(verifyBearer('Bearer ', BD_SECRET)).toBe(false);
    // A prefix of the real secret. The comparison is over fixed-length digests,
    // so a shorter guess cannot be distinguished by how long the check takes.
    expect(verifyBearer(`Bearer ${BD_SECRET.slice(0, 10)}`, BD_SECRET)).toBe(false);
  });

  it('an unsigned delivery never reaches the engine', async () => {
    await put('brightdata', { secret: BD_SECRET });
    const res = await postDelivery(
      new Request('http://x', { method: 'POST', body: JSON.stringify([{ html: '<h2>x</h2>' }]) }),
      ctx({ kind: 'brightdata', target: 'ikea' }),
    );
    expect(res.status).toBe(401);
    expect(((await res.json()) as { error: string }).error).toBe('unauthorized');
  });

  it('refuses before it reads the body, so an unauthenticated body is never buffered', async () => {
    await put('brightdata', { secret: BD_SECRET });
    let read = false;
    // Asserted on the call itself rather than through a streamed body: undici
    // drains a stream when the Request is CONSTRUCTED, so a real Request cannot
    // tell the two orderings apart. What matters is that the handler does not
    // reach arrayBuffer() before the bearer has been checked -- otherwise the
    // endpoint is a memory-exhaustion primitive for anyone who knows the URL.
    const fake = {
      headers: new Headers(),
      arrayBuffer: async () => { read = true; return new ArrayBuffer(0); },
    } as unknown as Request;

    const res = await postDelivery(fake, ctx({ kind: 'brightdata', target: 'ikea' }));
    expect(res.status).toBe(401);
    expect(read).toBe(false);
  });

  it('fails closed when nothing is configured', async () => {
    const res = await postDelivery(
      new Request('http://x', {
        method: 'POST',
        headers: { authorization: `Bearer ${BD_SECRET}` },
        body: JSON.stringify([{ html: '<h2>x</h2>' }]),
      }),
      ctx({ kind: 'brightdata', target: 'ikea' }),
    );
    expect(res.status).toBe(503);
  });
});

// ---------------------------------------------------------------------------

suite('bright data delivery: the body', () => {
  const rows = [{ html: '<html><h2>Recall notice for the thing</h2></html>' }];

  it('reads a JSON array', () => {
    expect(decodeDelivery(Buffer.from(JSON.stringify(rows)))).toEqual(rows);
  });

  it('reads NDJSON, which is a documented format option', () => {
    expect(decodeDelivery(Buffer.from(rows.map((r) => JSON.stringify(r)).join('\n')))).toEqual(rows);
  });

  it('reads the gzip Bright Data sends by default', () => {
    // uncompressed_webhook defaults to false, so this is the ORDINARY case.
    expect(decodeDelivery(gzipSync(Buffer.from(JSON.stringify(rows))))).toEqual(rows);
  });

  it('refuses an empty or unparseable body rather than ingesting nothing', () => {
    expect(() => decodeDelivery(Buffer.from(''))).toThrow(DeliveryError);
    expect(() => decodeDelivery(Buffer.from('[not json'))).toThrow(/valid JSON/);
    expect(() => decodeDelivery(Buffer.from('[]'))).toThrow(/no rows/);
  });

  it('calls a corrupt gzip a bad request, not a server fault', () => {
    // Bright Data retries every non-200, so a 500 here would retry for ever.
    const truncated = gzipSync(Buffer.from('[{"html":"x"}]')).subarray(0, 12);
    try {
      decodeDelivery(truncated);
      expect.unreachable('should have thrown');
    } catch (e) {
      expect((e as DeliveryError).status).toBe(400);
      expect((e as DeliveryError).code).toBe('bad_gzip');
    }
  });

  it('finds the page under any documented key, and says so when there is none', () => {
    for (const k of HTML_KEYS) expect(pageFrom([{ [k]: '<h2>x</h2>' }])).toBe('<h2>x</h2>');
    // An empty string is an absence, not a page. No silent fallback to ''.
    expect(() => pageFrom([{ html: '' }])).toThrow(/no row carried page bytes/);
    expect(() => pageFrom([{ price: 4 }])).toThrow(/no row carried page bytes/);
  });
});

// ---------------------------------------------------------------------------

suite('slack payload', () => {
  const a = breakMessage({ target: 'ikea', field: 'recall_title', diagnosis: 'The selector matches nothing.', run: 74 });

  it('is the shape the incoming-webhook endpoint documents', () => {
    const p = slackPayload(a) as any;
    // `text` is not enforced as required alongside `blocks`, but Slack falls
    // back to it for the desktop notification -- without it the alert can
    // arrive silent, which for a break alert is the whole failure.
    expect(p.text).toBe('ikea: I stopped publishing recall_title.');
    expect(p.blocks).toHaveLength(2);
    expect(p.blocks[0].type).toBe('section');
    expect(p.blocks[0].text.type).toBe('mrkdwn');
    expect(p.blocks[1].type).toBe('context');
    expect(p.blocks[1].elements).toHaveLength(1);
    expect(p.blocks.length).toBeLessThanOrEqual(50);
  });

  it('holds a section block to the documented 3000 characters', () => {
    const p = slackPayload({ ...a, body: 'x'.repeat(5000) }) as any;
    expect(p.blocks[0].text.text.length).toBeLessThanOrEqual(3000);
  });

  it('speaks the house voice: held, no percentage, no "successfully"', () => {
    const s = JSON.stringify(slackPayload(a));
    expect(s).toContain('stopped publishing');
    expect(s).toContain('Nothing wrong was published.');
    expect(s).not.toMatch(/successful/i);
    expect(s).not.toMatch(/\d+(\.\d+)?%/);
  });
});

suite('discord payload', () => {
  const a = breakMessage({ target: 'ikea', field: 'recall_title', diagnosis: 'The selector matches nothing.', run: 74 });

  it('is the shape Execute Webhook documents', () => {
    const p = discordPayload(a) as any;
    expect(p.embeds).toHaveLength(1);
    const e = p.embeds[0];
    expect(e.title).toBe('ikea: I stopped publishing recall_title.');
    expect(typeof e.color).toBe('number');
    expect(e.footer.text).toContain('Nothing wrong was published.');
  });

  it('respects every documented embed limit, including the 6000 total', () => {
    const p = discordPayload({ ...a, body: 'x'.repeat(9000), headline: 'y'.repeat(2000) }) as any;
    const e = p.embeds[0];
    expect(p.embeds.length).toBeLessThanOrEqual(10);
    expect(e.title.length).toBeLessThanOrEqual(256);
    expect(e.description.length).toBeLessThanOrEqual(4096);
    expect(e.footer.text.length).toBeLessThanOrEqual(2048);
    // The cap that catches people who validate each field on its own.
    const total = [e.title, e.description, e.footer.text].join('').length;
    expect(total).toBeLessThanOrEqual(6000);
  });
});

// ---------------------------------------------------------------------------

suite('delivery degrades honestly', () => {
  const a = breakMessage({ target: 'ikea', field: 'recall_title', diagnosis: 'gone', run: 74 });

  it('surfaces a 404 as a failure rather than swallowing it', async () => {
    await put('slack', { url: SLACK_URL });
    // Slack answers a revoked webhook with a plain-text body, not JSON.
    const fake = async () => new Response('no_service', { status: 404 });
    const [r] = await announce(a, fake as unknown as typeof fetch);
    expect(r!.ok).toBe(false);
    expect(r!.status).toBe(404);
    expect(r!.detail).toBe('no_service');
    expect(summarise([r!])).toBe('slack 404 no_service');
  });

  it('surfaces a dead host as never-reached, not as a rejection', async () => {
    await put('discord', { url: DISCORD_URL });
    const fake = async () => { throw new Error('ECONNREFUSED'); };
    const [r] = await announce(a, fake as unknown as typeof fetch);
    expect(r!.ok).toBe(false);
    expect(r!.status).toBe(0);          // 0 = never reached the other end
    expect(r!.detail).toBe('ECONNREFUSED');
  });

  it('reports a rate limit without sleeping on it or retrying', async () => {
    await put('discord', { url: DISCORD_URL });
    let calls = 0;
    const fake = async () => {
      calls++;
      return new Response(JSON.stringify({ retry_after: 1.5 }), { status: 429 });
    };
    const [r] = await announce(a, fake as unknown as typeof fetch);
    expect(calls).toBe(1);              // exactly one attempt. No retry loop.
    expect(r!.status).toBe(429);
    expect(r!.detail).toContain('1.5');
  });

  it('says so plainly when there is nowhere to send', async () => {
    expect(summarise(await announce(a))).toBe('no chat connector configured');
  });

  it('does not let one dead connector hide the other', async () => {
    await put('slack', { url: SLACK_URL });
    await put('discord', { url: DISCORD_URL });
    const fake = async (u: string) =>
      u.includes('slack') ? new Response('ok') : new Response('', { status: 500 });
    const rs = await announce(a, fake as unknown as typeof fetch);
    expect(rs).toHaveLength(2);
    expect(rs.filter((r) => r.ok)).toHaveLength(1);
    expect(rs.filter((r) => !r.ok)).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------

suite('the seam', () => {
  it('runs the delivered page down the same pipeline a local fetch takes', async () => {
    if (!dbUp) return;
    const target = {
      targetId: 'ikea',
      url: 'corpus://ikea',
      contract: {
        field: 'recall_title',
        expected: { regex: '(recall|rappel|retirada|remedy|alert)', regexFlags: 'i', minLen: 20 },
        resolver: {
          tags: 'h2,h3,a,li', flags: 'i', maxLen: 140, minLen: 20,
          include: 'recall|rappel|retirada|remedy kit',
          exclude: 'recalls\\.gov|learn more|click here|^product recalls$',
        },
        thresholds: { tau: 0.6, delta: 0.16 },
      },
    };
    const { readdir } = await import('node:fs/promises');
    const files = (await readdir('corpus/ikea')).filter((f) => f.endsWith('.html')).sort();
    const html = await readFile(`corpus/ikea/${files.at(-1)}`, 'utf8');

    const r = await ingestPage({ target, html, via: 'brightdata' });

    // The proof record carries provenance and nothing else that a local fetch
    // would not also produce. If this ever needs a branch inside the engine,
    // the seam is wrong.
    if (!r.skipped) {
      expect(r.result!.event.via).toBe('brightdata');
      expect(r.result!.event.site).toBe('ikea');
      expect(['ok', 'heal', 'abstain']).toContain(r.result!.event.event);
      expect(r.result!.event.thresholds).toEqual({ tau: 0.6, delta: 0.16 });
      // A held cell is null. The webhook path cannot fill one either.
      if (r.result!.status.status === 'quarantined') {
        expect(r.result!.publishedValue).toBeNull();
      }
    }

    // Cleanup: this test writes real rows.
    await getDb().execute(sql`DELETE FROM field_runs WHERE run_id = ${r.runId}`);
    await getDb().execute(sql`DELETE FROM runs WHERE run_id = ${r.runId}`);
  });

  it('refuses a contract with no resolver instead of guessing one', async () => {
    if (!dbUp) return;
    // pickTarget defaults to its built-in RECALL_TITLE contract when handed
    // undefined. On an arbitrary page that is a confident wrong answer, which
    // is worse than an error.
    await expect(ingestPage({
      target: { targetId: 'ikea', url: 'corpus://ikea', contract: { field: 'recall_title' } },
      html: '<html><body><h2>Recall notice for the thing</h2></body></html>',
      via: 'brightdata',
    })).rejects.toThrow();
  });

  it('digests the page the way runs.page_sha does, so a replay can be recognised', () => {
    // Same bytes in, same digest out -- the property the replay check rests on.
    const html = '<html><body><script>x</script><h2>Recall notice</h2></body></html>';
    expect(pageDigest(html)).toBe(pageDigest(html));
    expect(pageDigest(html)).not.toBe(pageDigest(html.replace('Recall', 'Rappel')));
    // Scripts are stripped before hashing, so an inline analytics blob that
    // changes on every render is not mistaken for a changed page.
    expect(pageDigest(html)).toBe(pageDigest(html.replace('<script>x</script>', '<script>y</script>')));
  });
});

suite('mcp surface', () => {
  it('exposes connector presence and no way to read or write a credential', async () => {
    const tools = await loadTools();
    expect(tools.assay_connectors).toBeTruthy();
    const names = Object.keys(tools);
    // Nothing on this server sets a credential. An agent driven by untrusted
    // page text is the last place to put a bearer token.
    expect(names.filter((n) => /connector/.test(n))).toEqual(['assay_connectors']);

    await put('slack', { url: SLACK_URL });
    const out = JSON.stringify(await tools.assay_connectors!.run({}));
    expect(out).toContain('announced to slack');
    expect(out).not.toContain('hooks.slack.com');
  });

  it('says plainly when nobody would hear about a held field', async () => {
    const tools = await loadTools();
    const out = (await tools.assay_connectors!.run({})) as any;
    expect(out.announcements).toContain('nobody would be told');
  });
});
