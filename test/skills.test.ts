// The page-source registry, the consent store, and the one property that makes
// both safe to put on a screen: nothing here can carry a credential's value.
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
//
// WHAT CHANGED, 2026-08-23. The Skills screen was removed as superseded by
// `/library`, and it was the only writer the consent store ever had, so
// `enable()` and `disable()` went with it -- the suite that exercised them is
// replaced by one asserting the module now has no writer at all. The registry
// lost its four skills.sh entries, which existed only to be rendered on that
// screen, and it lost Bright Data, which was the second place in this repository
// claiming to know a credential's state. There is a named guard for that below:
// this registry must not grow a Bright Data row again.

import { describe as suite, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// `example.com` is answered here rather than by a real nameserver. The fetch
// seam resolves a hostname before it opens anything (src/skills/page.ts), and
// these tests are about which SOURCE supplied the bytes -- making them depend on
// DNS would make them fail on a train. The address is the real one, and
// test/ssrf.test.ts exercises the resolver itself with names that need no
// network at all.
vi.mock('node:dns/promises', () => ({
  lookup: async () => [{ address: '93.184.216.34', family: 4 }],
}));

import { SKILLS, skillById, stateOf, statesOf } from '../src/skills/index.js';
import * as store from '../src/skills/store.js';
import { enabled, STORE_PATH } from '../src/skills/store.js';
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

/**
 * The consent file, written by hand.
 *
 * The store has no writer of its own any more -- this IS how an operator turns
 * a source on, so a test that used `enable()` would be testing something no one
 * can do.
 */
async function writeStore(ids: string[]) {
  const { writeFile } = await import('node:fs/promises');
  await writeFile(STORE_PATH(), JSON.stringify({ enabled: ids }));
}

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
      expect(s.id, 'an entry with no id cannot be enabled').toBeTruthy();
      expect(s.summary.length, `${s.id} has no summary`).toBeGreaterThan(10);
    }
  });

  it('declares credentials by variable NAME, spelled as the code reads them', () => {
    for (const s of SKILLS) {
      for (const v of s.needs) {
        expect(v, `${s.id} declares an unnamed variable`).toMatch(/^[A-Z][A-Z0-9_]+$/);
      }
    }
  });

  it('lists only sources this build can actually call', () => {
    // The four skills.sh entries this registry used to carry could not run here
    // and were listed so a screen could say why. That screen is gone. A row
    // nothing can call and nothing renders is dead data, and `fetchHtml` would
    // silently skip it -- so the registry is now exactly the sources that work.
    for (const s of SKILLS) {
      expect(s.always || s.needs.length > 0, `${s.id} is neither always-on nor credentialled`)
        .toBe(true);
    }
  });

  it('has exactly one always-on source, and it needs no credential', () => {
    const always = SKILLS.filter((s) => s.always);
    expect(always).toHaveLength(1);
    expect(always[0]!.needs).toHaveLength(0);
  });

  // The regression guard for the bug this registry was half of. Bright Data was
  // listed here with its own enable flag and its own variable name
  // (BRIGHT_DATA_TOKEN, which nothing has ever read) while `src/connectors/`
  // held the real configuration. Two registries for one credential is how
  // Settings ended up telling an operator who was USING Bright Data that Bright
  // Data was not connected. It has one owner now.
  it('does not claim to own Bright Data', () => {
    const names = JSON.stringify(SKILLS).toLowerCase();
    expect(names, 'Bright Data belongs to src/connectors, not to this registry')
      .not.toContain('bright');
    expect(SKILLS.flatMap((s) => s.needs)).not.toContain('BRIGHT_DATA_TOKEN');
    expect(SKILLS.flatMap((s) => s.needs)).not.toContain('BRIGHTDATA_API_TOKEN');
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
      BRIGHTDATA_API_TOKEN: SECRET,
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

  it('reports the always-on source as on whatever the store says', async () => {
    // No file at all -- the state every clone starts in.
    expect(await enabled()).toEqual([]);
    expect(stateOf(skillById('local-fetch')!, [], {}).active).toBe(true);
    // And a file that does not mention it. "Assay can read a page" must not be
    // something a deleted or hand-edited file can switch off.
    await writeStore(['firecrawl']);
    expect(stateOf(skillById('local-fetch')!, await enabled(), {}).active).toBe(true);
  });
});

suite('the consent store', () => {
  it('reads the ids the operator wrote', async () => {
    expect(await enabled(), 'no file means nothing consented to').toEqual([]);
    await writeStore(['firecrawl']);
    expect(await enabled()).toEqual(['firecrawl']);
  });

  it('drops an id this build no longer has', async () => {
    await writeStore(['firecrawl', 'removed-in-a-later-build']);
    expect(await enabled()).toEqual(['firecrawl']);
  });

  it('survives a file that is not the shape it expects', async () => {
    const { writeFile } = await import('node:fs/promises');
    await writeFile(STORE_PATH(), JSON.stringify({ enabled: 'firecrawl' }));
    expect(await enabled(), 'a hand-edited file must not become a crash').toEqual([]);
  });

  // The Skills screen was the only thing that ever wrote this file, and it is
  // gone. Two exported writers with no caller is how a module rots, and a
  // browser-writable consent file that no browser can reach any more is a
  // smaller attack surface, so the writers went with the screen. This asserts
  // the module stays read-only rather than trusting the comment saying so.
  it('has no writer at all', () => {
    expect(Object.keys(store).sort()).toEqual(['STORE_PATH', 'enabled']);
  });
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
