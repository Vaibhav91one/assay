// The skill registry, the consent store, and the one property that makes both
// safe to put on a screen: nothing here can carry a credential's value.
//
// The file leads with that for the same reason `test/connectors.test.ts` leads
// with its own version of it. Everything else is a shape check; "a state object
// has nowhere to put a secret" is the property the whole surface rests on, so it
// is walked structurally rather than spot-checked on the field that happens to
// be new.
//
// The second property under test is that ENABLING CHANGES NOTHING ON A PAGE THAT
// WORKS. A connector is consulted only after a direct request has been refused,
// which is what lets an operator turn one on without wondering whether their
// existing targets just started going somewhere else.

import { describe as suite, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { SKILLS, skillById, stateOf, statesOf } from '../src/skills/index.js';
import { enabled, enable, disable, STORE_PATH } from '../src/skills/store.js';
import { fetchHtml } from '../src/skills/page.js';
import { loadTools } from '../src/mcp/server.js';

const SECRET = 'sk-live-this-must-never-be-rendered';

let dir: string;
const saved = { store: process.env.ASSAY_SKILLS, key: process.env.FIRECRAWL_API_KEY };

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'assay-skills-'));
  process.env.ASSAY_SKILLS = join(dir, 'skills.json');
  delete process.env.FIRECRAWL_API_KEY;
});

afterEach(async () => {
  vi.unstubAllGlobals();
  await rm(dir, { recursive: true, force: true });
  if (saved.store === undefined) delete process.env.ASSAY_SKILLS;
  else process.env.ASSAY_SKILLS = saved.store;
  if (saved.key === undefined) delete process.env.FIRECRAWL_API_KEY;
  else process.env.FIRECRAWL_API_KEY = saved.key;
});

/** Every string anywhere in a value, however deeply nested. */
function strings(v: unknown, out: string[] = []): string[] {
  if (typeof v === 'string') out.push(v);
  else if (Array.isArray(v)) for (const x of v) strings(x, out);
  else if (v && typeof v === 'object') for (const x of Object.values(v)) strings(x, out);
  return out;
}

suite('the registry', () => {
  it('describes every entry it lists', () => {
    for (const s of SKILLS) {
      expect(s.id, 'an entry with no id cannot be enabled or disabled').toBeTruthy();
      expect(s.summary.length, `${s.id} has no summary`).toBeGreaterThan(10);
      // The invariant the screen depends on: a row that cannot run says why, and
      // a row that can run does not carry an excuse.
      if (s.provides === null) expect(s.inert, `${s.id} cannot run and does not say why`).toBeTruthy();
      else expect(s.inert, `${s.id} runs but carries an inert reason`).toBeNull();
    }
  });

  it('names a documentation section for every credential it declares', () => {
    for (const s of SKILLS) {
      for (const n of s.needs) {
        expect(n.var, `${s.id} declares an unnamed variable`).toMatch(/^[A-Z][A-Z0-9_]+$/);
        expect(n.doc, `${s.id}/${n.var} has no docs link`).toMatch(/^\/docs\//);
      }
    }
  });

  it('has exactly one always-on source, and it needs no credential', () => {
    const always = SKILLS.filter((s) => s.always);
    expect(always).toHaveLength(1);
    expect(always[0]!.needs).toHaveLength(0);
    expect(always[0]!.provides).toBe('page-source');
  });
});

suite('presence', () => {
  it('reports a declared variable as missing until it is set', () => {
    const fc = skillById('firecrawl')!;
    expect(stateOf(fc, ['firecrawl'], {}).missing).toEqual(['FIRECRAWL_API_KEY']);
    expect(stateOf(fc, ['firecrawl'], {}).active).toBe(false);
    expect(stateOf(fc, ['firecrawl'], { FIRECRAWL_API_KEY: SECRET }).active).toBe(true);
  });

  it('keeps enabled and satisfied as separate facts', () => {
    const fc = skillById('firecrawl')!;
    // Enabled but no key: the operator consented and the machine is not ready.
    // Collapsing these is how a panel tells someone their setup is fine.
    const consented = stateOf(fc, ['firecrawl'], {});
    expect(consented.enabled).toBe(true);
    expect(consented.satisfied).toBe(false);
    // Key but no consent: nothing may use it.
    const unasked = stateOf(fc, [], { FIRECRAWL_API_KEY: SECRET });
    expect(unasked.enabled).toBe(false);
    expect(unasked.satisfied).toBe(true);
    expect(unasked.active).toBe(false);
  });

  it('never carries a credential value, anywhere in the object', () => {
    const states = statesOf(SKILLS.map((s) => s.id), {
      FIRECRAWL_API_KEY: SECRET,
      BRIGHT_DATA_TOKEN: SECRET,
      SGAI_API_KEY: SECRET,
    });
    const all = strings(states);
    expect(all.length).toBeGreaterThan(0);
    for (const s of all) {
      expect(s, 'a credential value reached a state object').not.toContain(SECRET);
      expect(s).not.toContain('sk-live');
    }
    // And the names ARE carried -- presence-only is not the same as silent.
    expect(all).toContain('FIRECRAWL_API_KEY');
  });

  it('reports the always-on source as on without it being stored', async () => {
    await enable('local-fetch');
    expect(await enabled(), 'an always-on row must not become a stored choice').toEqual([]);
    expect(stateOf(skillById('local-fetch')!, [], {}).active).toBe(true);
  });
});

suite('the consent store', () => {
  it('records a yes and takes it back', async () => {
    expect(await enabled()).toEqual([]);
    await enable('firecrawl');
    expect(await enabled()).toEqual(['firecrawl']);
    await enable('firecrawl');
    expect(await enabled(), 'enabling twice must not duplicate').toEqual(['firecrawl']);
    await disable('firecrawl');
    expect(await enabled()).toEqual([]);
    await disable('firecrawl');
  });

  it('holds ids and nothing else', async () => {
    await enable('firecrawl');
    const raw = JSON.parse(await readFile(STORE_PATH(), 'utf8'));
    expect(raw).toEqual({ enabled: ['firecrawl'] });
  });

  it('refuses an id this build does not have, and drops one it no longer has', async () => {
    await expect(enable('not-a-skill')).rejects.toThrow(/no skill/);
    await writeStore(['firecrawl', 'removed-in-a-later-build']);
    expect(await enabled()).toEqual(['firecrawl']);
  });

  async function writeStore(ids: string[]) {
    const { writeFile } = await import('node:fs/promises');
    await writeFile(STORE_PATH(), JSON.stringify({ enabled: ids }));
  }
});

suite('the fetch seam', () => {
  it('reads the corpus without a network at all', async () => {
    vi.stubGlobal('fetch', () => { throw new Error('the corpus path must not touch the network'); });
    const { html, via } = await fetchHtml('corpus://ikea');
    expect(via).toBe('corpus');
    expect(html.length).toBeGreaterThan(100);
  });

  it('does one plain request and stops, when the plain request works', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', async (u: string) => {
      calls.push(String(u));
      return new Response('<html><p>ok</p></html>', { status: 200 });
    });
    process.env.FIRECRAWL_API_KEY = SECRET;
    const { via } = await fetchHtml('https://example.com/', ['firecrawl']);
    // The property an operator is owed: enabling a connector changes NOTHING on
    // a page that already worked. No second request, and no credit spent.
    expect(via).toBe('local-fetch');
    expect(calls).toEqual(['https://example.com/']);
  });

  it('falls back to an enabled connector only after a refusal', async () => {
    vi.stubGlobal('fetch', async (u: string, init?: RequestInit) => {
      if (String(u).startsWith('https://api.firecrawl.dev')) {
        expect(JSON.parse(String(init!.body))).toEqual({
          url: 'https://example.com/', formats: ['rawHtml'],
        });
        return Response.json({ success: true, data: { rawHtml: '<html><p>via fc</p></html>' } });
      }
      return new Response('no', { status: 403 });
    });
    process.env.FIRECRAWL_API_KEY = SECRET;
    const { html, via } = await fetchHtml('https://example.com/', ['firecrawl']);
    expect(via).toBe('firecrawl');
    expect(html).toContain('via fc');
  });

  it('does not fall back to a connector the operator never enabled', async () => {
    vi.stubGlobal('fetch', async (u: string) => {
      if (String(u).startsWith('https://api.firecrawl.dev')) throw new Error('must not be called');
      return new Response('no', { status: 403 });
    });
    process.env.FIRECRAWL_API_KEY = SECRET;
    await expect(fetchHtml('https://example.com/', [])).rejects.toThrow('fetch 403');
  });

  it('does not fall back to a connector whose key is absent', async () => {
    vi.stubGlobal('fetch', async (u: string) => {
      if (String(u).startsWith('https://api.firecrawl.dev')) throw new Error('must not be called');
      return new Response('no', { status: 403 });
    });
    await expect(fetchHtml('https://example.com/', ['firecrawl'])).rejects.toThrow('fetch 403');
  });

  it('treats a 200 with no html as a failure, not as an empty page', async () => {
    vi.stubGlobal('fetch', async (u: string) => {
      if (String(u).startsWith('https://api.firecrawl.dev')) {
        return Response.json({ success: true, data: { metadata: { statusCode: 200 } } });
      }
      return new Response('no', { status: 403 });
    });
    process.env.FIRECRAWL_API_KEY = SECRET;
    // An empty page would read downstream as "the field disappeared" -- the
    // green-run-empty-column failure this whole project is about.
    await expect(fetchHtml('https://example.com/', ['firecrawl']))
      .rejects.toThrow(/no rawHtml/);
  });

  it('names both failures, and neither names the key', async () => {
    vi.stubGlobal('fetch', async (u: string) =>
      String(u).startsWith('https://api.firecrawl.dev')
        ? Response.json({ error: 'Payment required to access this resource.' }, { status: 402 })
        : new Response('no', { status: 403 }));
    process.env.FIRECRAWL_API_KEY = SECRET;
    const err = await fetchHtml('https://example.com/', ['firecrawl'])
      .then(() => null, (e: Error) => e);
    expect(err, 'the fetch was supposed to fail').not.toBeNull();
    expect(err!.message).toContain('fetch 403');
    expect(err!.message).toContain('402');
    expect(err!.message).not.toContain(SECRET);
  });
});

suite('the MCP surface', () => {
  it('serves the registry and offers no way to enable anything', async () => {
    const tools = await loadTools();
    expect(Object.keys(tools)).toContain('assay_skills');
    // The grant stays the operator's. An agent driven over untrusted page text
    // must not be able to hand itself a host and a credential.
    for (const name of Object.keys(tools)) {
      expect(name).not.toMatch(/skill.*(enable|grant|install|add)/);
    }
  });

  it('reports names and never values', async () => {
    process.env.FIRECRAWL_API_KEY = SECRET;
    const tools = await loadTools();
    const out = await tools.assay_skills!.run({});
    const all = strings(out);
    for (const s of all) expect(s).not.toContain(SECRET);
    expect(all).toContain('FIRECRAWL_API_KEY');
  });
});
