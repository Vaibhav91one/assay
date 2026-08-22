// The chat surface: the composer's keyboard model, the SSE reader, the trace
// the agent emits, and the four constants the browser has to hold a copy of.
//
// The drift tests are the load-bearing half. `web/lib/models.ts`,
// `web/lib/contract-shape.ts` repeat ids, thresholds and reason wordings that
// the engine owns, because importing the engine modules into a client component
// would pull the Agent SDK -- and the Node built-ins it opens -- into the
// browser bundle. Repetition is only acceptable while something fails when the
// two disagree, which is what these assert.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { withoutCredentials } from './no-credentials.js';

import { MODELS as ENGINE_MODELS, CADENCES, converse, type TraceEvent } from '../src/agent/index.js';
import { TIER_THRESHOLDS as ENGINE_TIERS, DEFAULT_THRESHOLDS as ENGINE_DEFAULTS } from '../src/contracts/index.js';
import { heldBecause } from '../src/reports/vocabulary.js';

import { MODELS, DEFAULT_MODEL, CADENCE_OPTIONS } from '../web/lib/models.js';
import { TIER_THRESHOLDS, DEFAULT_THRESHOLDS, HELD_BECAUSE } from '../web/lib/contract-shape.js';
import { menuAt, applyChoice } from '../web/lib/composer-menu.js';
import { frames } from '../web/lib/chat-stream.js';

// --- the constants the browser copies ----------------------------------------

describe('the picker cannot offer a model the allowlist would reject', () => {
  it('lists exactly the engine allowlist, in the same order', () => {
    expect(MODELS.map((m) => m.id)).toEqual([...ENGINE_MODELS]);
  });

  it('defaults to a model that is on the list', () => {
    expect(ENGINE_MODELS).toContain(DEFAULT_MODEL as (typeof ENGINE_MODELS)[number]);
  });

  it('offers exactly the cadences the scheduler can act on', () => {
    expect([...CADENCE_OPTIONS]).toEqual([...CADENCES]);
  });
});

describe('the header popover shows the engine\'s own numbers', () => {
  it('repeats every tier threshold exactly', () => {
    expect(TIER_THRESHOLDS).toEqual(ENGINE_TIERS);
  });

  it('repeats the defaults a contract that says nothing means', () => {
    expect(DEFAULT_THRESHOLDS.policy).toBe(ENGINE_DEFAULTS.policy);
    expect(DEFAULT_THRESHOLDS.tau).toBe(ENGINE_DEFAULTS.tau);
    expect(DEFAULT_THRESHOLDS.delta).toBe(ENGINE_DEFAULTS.delta);
    expect(DEFAULT_THRESHOLDS.onAbstain).toBe(ENGINE_DEFAULTS.onAbstain);
    expect(DEFAULT_THRESHOLDS.autoApproveAbove).toBe(ENGINE_DEFAULTS.autoApproveAbove);
  });
});

describe('a held cell says what the engine means', () => {
  it('uses the vocabulary\'s own wording for every code it knows', () => {
    for (const [code, plain] of Object.entries(HELD_BECAUSE)) {
      expect(heldBecause(code)?.plain).toBe(plain);
    }
  });

  it('has no wording the engine does not also have', () => {
    // The reverse direction: a phrase invented here would render as though the
    // engine had said it. `heldBecause` returning a null `plain` is a miss.
    for (const code of Object.keys(HELD_BECAUSE)) {
      expect(heldBecause(code)?.plain).not.toBeNull();
    }
  });

  it('leaves an unknown code untranslated rather than inventing one', () => {
    expect(HELD_BECAUSE.something_new).toBeUndefined();
    expect(heldBecause('something_new')?.plain).toBeNull();
  });
});

// --- the composer's keyboard model -------------------------------------------

describe('menuAt', () => {
  it('opens on a sigil at the start of the box', () => {
    expect(menuAt('@', 1)).toEqual({ sigil: '@', from: 0, query: '' });
    expect(menuAt('/de', 3)).toEqual({ sigil: '/', from: 0, query: 'de' });
  });

  it('opens on a sigil after a space', () => {
    expect(menuAt('watch @pri', 10)).toEqual({ sigil: '@', from: 6, query: 'pri' });
  });

  it('does NOT open inside an email address', () => {
    // The case that makes the start-of-word rule worth having.
    expect(menuAt('mail me at you@example.com', 26)).toBeNull();
  });

  it('does NOT open on a slash inside a URL', () => {
    expect(menuAt('https://example.com/recalls', 27)).toBeNull();
    expect(menuAt('watch https://x.com/a/b', 23)).toBeNull();
  });

  it('closes once a space is typed', () => {
    expect(menuAt('@price ', 7)).toBeNull();
  });

  it('reads the caret, not the end of the string', () => {
    // Caret parked just after `@pr`, with more text to its right.
    expect(menuAt('@price and more', 3)).toEqual({ sigil: '@', from: 0, query: 'pr' });
  });

  it('is closed when there is no caret', () => {
    expect(menuAt('@price', null)).toBeNull();
  });
});

describe('applyChoice', () => {
  it('replaces the sigil and the query, and leaves the caret after the id', () => {
    const menu = menuAt('watch @pri', 10)!;
    const { value, caret } = applyChoice('watch @pri', menu, 'ikea__price');
    expect(value).toBe('watch @ikea__price ');
    expect(value.slice(0, caret)).toBe('watch @ikea__price ');
  });

  it('keeps text that sits after the caret', () => {
    const menu = menuAt('@pri tail', 4)!;
    expect(applyChoice('@pri tail', menu, 'x__y').value).toBe('@x__y  tail');
  });
});

// --- the SSE reader ----------------------------------------------------------

/** A body that hands back exactly the chunks given, however they are split. */
function bodyOf(...chunks: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(c) {
      for (const s of chunks) c.enqueue(enc.encode(s));
      c.close();
    },
  });
}

const collect = async (b: ReadableStream<Uint8Array>) => {
  const out = [];
  for await (const f of frames(b)) out.push(f);
  return out;
};

describe('frames', () => {
  it('reads one whole frame', async () => {
    const got = await collect(bodyOf('data: {"type":"step","kind":"started","model":"m","at":1}\n\n'));
    expect(got).toEqual([{ type: 'step', kind: 'started', model: 'm', at: 1 }]);
  });

  it('reassembles a frame split across chunks', async () => {
    // The case that breaks a naive reader: the network splits mid-JSON.
    const got = await collect(bodyOf('data: {"type":"res', 'ult","result":{"kind":"manual"}}\n\n'));
    expect(got).toEqual([{ type: 'result', result: { kind: 'manual' } }]);
  });

  it('skips the comment padding the route sends for WebKit', async () => {
    const got = await collect(bodyOf(':      \n\n', 'data: {"type":"step","kind":"settled","outcome":"propose","at":2}\n\n'));
    expect(got).toEqual([{ type: 'step', kind: 'settled', outcome: 'propose', at: 2 }]);
  });

  it('drops a truncated final frame rather than throwing', async () => {
    // A dropped connection is a real event; a turn that otherwise arrived must
    // not be failed by it.
    const got = await collect(bodyOf('data: {"type":"step","kind":"started","model":"m","at":1}\n\ndata: {"typ'));
    expect(got).toHaveLength(1);
  });

  it('drops an unparseable frame rather than guessing at it', async () => {
    const got = await collect(bodyOf('data: not json\n\ndata: {"type":"result","result":{"kind":"manual"}}\n\n'));
    expect(got).toEqual([{ type: 'result', result: { kind: 'manual' } }]);
  });

  it('reads several frames arriving in one chunk', async () => {
    const got = await collect(bodyOf(
      'data: {"type":"step","kind":"started","model":"m","at":1}\n\n'
      + 'data: {"type":"step","kind":"settled","outcome":"manual","at":2}\n\n',
    ));
    expect(got).toHaveLength(2);
  });
});

// --- the trace ---------------------------------------------------------------

describe('the trace reports what happened, and nothing else', () => {
  // Imposed, not guessed. Every developer who has run `claude setup-token` has
  // a CLI login, so a suite that skipped itself when `hasKey()` was true would
  // have quietly stopped proving the no-model path on exactly the machines
  // that ship the product.
  const creds = withoutCredentials();
  beforeAll(creds.enter);
  afterAll(creds.leave);

  it('emits a settled step and no tool steps when no model is configured', async () => {
    const seen: TraceEvent[] = [];
    const r = await converse(
      { message: 'watch https://example.com' },
      { onEvent: (e) => seen.push(e), now: () => 1000 },
    );
    expect(r.kind).toBe('manual');
    expect(seen).toEqual([{ kind: 'settled', outcome: 'manual', at: 1000 }]);
    expect(seen.some((e) => e.kind === 'tool')).toBe(false);
  });

  it('stamps every step from the injected clock, never the wall clock', async () => {
    let t = 0;
    const seen: TraceEvent[] = [];
    await converse({ message: 'hello' }, { onEvent: (e) => seen.push(e), now: () => (t += 7) });
    expect(seen.map((e) => e.at)).toEqual([7]);
  });

  it('runs the identical loop when nobody is watching', async () => {
    // No `onEvent`: observing must not be what makes the turn work.
    const r = await converse({ message: 'watch https://example.com' });
    expect(r.kind).toBe('manual');
  });
});

describe('the model a browser asks for', () => {
  it('is an allowlist, so an arbitrary string cannot reach the SDK', () => {
    // The guard is membership, not sanitisation: there is no transformation
    // here that could turn an unknown name into an accepted one.
    expect(ENGINE_MODELS).not.toContain('../../etc/passwd' as never);
    expect(ENGINE_MODELS.every((m) => /^claude-[a-z0-9-]+$/.test(m))).toBe(true);
  });
});
