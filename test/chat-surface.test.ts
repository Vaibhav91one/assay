// The chat surface: the composer's keyboard model, the SSE reader, and the
// trace the agent emits.
//
// WHAT USED TO BE HERE. Model ids, cadences, tier thresholds and held-cell
// wordings were copied into `web/lib/`, because importing the engine modules
// that own them into a client component would pull the Agent SDK -- and the
// Node built-ins it opens -- into the browser bundle. Six drift tests asserted
// the copies still matched.
//
// They are gone because the copies are gone. Those values now live in
// `src/agent/models.ts`, `src/contracts/tiers.ts` and `src/reports/
// vocabulary.ts` -- modules that declare values and import nothing -- and the
// browser imports the same declarations the engine does. A test that two
// expressions for the same constant are equal proves nothing.
//
// The one property those tests carried that is not structural is kept below:
// the allowlist is membership, not sanitisation.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { withoutCredentials } from './no-credentials.js';

import { MODELS as ENGINE_MODELS, converse, type TraceEvent } from '../src/agent/index.js';
import { MODELS, MODEL_LABEL, DEFAULT_MODEL } from '../src/agent/models.js';
import { HELD_BECAUSE, heldBecause } from '../src/reports/vocabulary.js';

import { tail, turnFailed, toMarkdown, type Turn } from '../src/store/conversation-log.js';

import { menuAt, applyChoice, insertSigil } from '../web/lib/composer-menu.js';
import { frames } from '../web/lib/chat-stream.js';

// --- the leaf modules the browser imports -------------------------------------

describe('the modules a client component imports declare values and nothing else', () => {
  // This is the guard the drift tests were standing in for, and it is worth
  // more than they were: they detected two copies disagreeing AFTER it
  // happened, this refuses the cause. Every one of these files is imported from
  // a `'use client'` component, so the first `import` added to one of them
  // reaches the browser bundle with everything it transitively opens -- `fs`,
  // `dns`, `net`, `tls` -- and the Next build fails on `Can't resolve 'fs'`.
  //
  // Source text rather than a bundler: the property is "this file has no
  // imports", which is exactly what is being read. Nothing here needs a build.
  const LEAVES = [
    'src/agent/models.ts',
    'src/contracts/tiers.ts',
    'src/reports/vocabulary.ts',
  ];

  for (const f of LEAVES) {
    it(`${f} imports nothing`, async () => {
      const { readFile } = await import('node:fs/promises');
      const src = await readFile(new URL(`../${f}`, import.meta.url), 'utf8');
      const found = src.split('\n').filter((l) => /^\s*(import|export)\s.*\sfrom\s/.test(l));
      expect(found).toEqual([]);
    });
  }
});

// --- the allowlist ------------------------------------------------------------

describe('the picker cannot offer a model the allowlist would reject', () => {
  it('is the engine\'s own list, not a copy of it', () => {
    // Identity, not equality: `web/lib/models.ts` used to hold a second array
    // and a test asserted the two agreed. There is one array now.
    expect(MODELS).toBe(ENGINE_MODELS);
  });

  it('names every model it offers', () => {
    // `MODEL_LABEL` is a `Record<Model, string>`, so a new id is a compile
    // error until it is named. This catches the one thing the type cannot: a
    // label left as an empty string.
    for (const m of MODELS) expect(MODEL_LABEL[m]).toBeTruthy();
  });

  it('defaults to a model that is on the list', () => {
    expect(MODELS).toContain(DEFAULT_MODEL);
  });
});

// --- the held-cell wording -----------------------------------------------------

describe('a held cell never gets an adjective the engine did not say', () => {
  // This one is NOT a drift test and stays: `HELD_BECAUSE` and `heldBecause`
  // are one table and one reader now, but the rule they enforce together is a
  // product rule -- APP-DESIGN 5b rule 5, a reason code never reaches the user
  // raw, and a record whose whole value is that it does not fabricate cannot
  // start by fabricating. `web/app/(app)/schema-table.tsx` reads the table
  // directly and prints the code AS a code on a miss.
  it('leaves an unknown code untranslated rather than inventing one', () => {
    expect(HELD_BECAUSE.something_new).toBeUndefined();
    expect(heldBecause('something_new')?.plain).toBeNull();
  });

  it('translates every code it does know', () => {
    for (const [code, plain] of Object.entries(HELD_BECAUSE)) {
      expect(heldBecause(code)?.plain).toBe(plain);
      expect(plain).toBeTruthy();
    }
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

// The owner, from live use: "whenever you click on @ and /, it enters the
// prompt bar multiple times." Reproduced on the running instance -- three
// deliberate clicks on `@` left `@ @ @` in the message, and the same for `/`.
// One character per click, so nothing was firing twice; the button opens the
// menu by TYPING the sigil, and it typed another one every time whether a menu
// was open or not.
describe('insertSigil', () => {
  it('opens the menu on an empty box', () => {
    expect(insertSigil('', 0, '@')).toEqual({ value: '@', caret: 1 });
    expect(insertSigil('', 0, '/')).toEqual({ value: '/', caret: 1 });
  });

  it('does not type a second sigil when that menu is already open', () => {
    // The reported bug, at the size it actually is.
    let v = insertSigil('', 0, '@');
    for (let i = 0; i < 5; i++) v = insertSigil(v.value, v.caret, '@');
    expect(v).toEqual({ value: '@', caret: 1 });

    // With a query typed into the open menu, the query survives untouched --
    // re-opening a menu must not throw away what was typed into it.
    expect(insertSigil('@ike', 4, '@')).toEqual({ value: '@ike', caret: 4 });
    expect(insertSigil('/dec', 4, '/')).toEqual({ value: '/dec', caret: 4 });
  });

  it('opens the other menu even when one is open, because that is a different ask', () => {
    expect(insertSigil('@ike', 4, '/').value).toBe('@ike /');
    expect(insertSigil('/dec', 4, '@').value).toBe('/dec @');
  });

  it('starts a word, because that is where menuAt looks for a sigil', () => {
    const r = insertSigil('watch', 5, '@');
    expect(r.value).toBe('watch @');
    expect(r.caret).toBe(7);
    // The proof that the pad is not cosmetic: without it there is no menu.
    expect(menuAt(r.value, r.caret)).toMatchObject({ sigil: '@', query: '' });
    expect(menuAt('watch@', 6)).toBeNull();
  });

  it('adds no pad after whitespace or at the start', () => {
    expect(insertSigil('watch ', 6, '@')).toEqual({ value: 'watch @', caret: 7 });
    expect(insertSigil('a\n', 2, '/')).toEqual({ value: 'a\n/', caret: 3 });
  });

  it('inserts at the caret and keeps what follows it', () => {
    // Measured against the running instance: "hello world" with the caret after
    // "hello" gives "hello @ world" and a caret at 7.
    expect(insertSigil('hello world', 5, '@')).toEqual({ value: 'hello @ world', caret: 7 });
  });

  it('closes a menu the caret has left, rather than treating it as open', () => {
    // `@ike ` with a trailing space is no longer a menu -- `menuAt` says so --
    // so the operator asking for one again gets one.
    expect(menuAt('@ike ', 5)).toBeNull();
    expect(insertSigil('@ike ', 5, '@')).toEqual({ value: '@ike @', caret: 6 });
  });
});

// --- a turn that did not land -------------------------------------------------

// From the live instance, and the reason this section exists. The stored
// conversation held two `operator` turns back to back with no reply between
// them: the first message was written to Postgres before the agent was asked,
// the agent call was then killed by a stale server render, and the screen said
// nothing at all -- so the operator typed it again. What made the silence
// possible is that the transcript had no way to SAY a turn failed. An operator
// turn with nothing after it is the same row shape whether the answer is still
// coming or is never coming, so the screen could not draw the difference and
// drew neither.
describe('a transcript can say a turn failed, and not only that one is missing', () => {
  const asked: Turn = { role: 'operator', text: 'watch https://example.com', at: '2026-08-22T19:52:45.035Z' };
  const answered: Turn = { role: 'assay', text: 'I can watch that.', at: '2026-08-22T19:53:15.833Z' };

  it('reads a question with nothing after it as unanswered, which is a turn in flight', () => {
    // The state the live row was in, and the state the UI is entitled to draw
    // as "still running" -- which is exactly why a failure must not look
    // like it.
    expect(tail([asked])).toBe('unanswered');
  });

  it('reads a recorded failure as failed, which is a state the UI can show', () => {
    const failed = turnFailed('Assay did not answer this message.', '2026-08-22T19:52:50.000Z');
    expect(tail([asked, failed])).toBe('failed');
    // And the two are genuinely different values, which is the whole property:
    // before this event existed the screen was handed the same list either way.
    expect(tail([asked, failed])).not.toBe(tail([asked]));
  });

  it('reads an answered question as answered, failure or no failure earlier', () => {
    const failed = turnFailed('Assay did not answer this message.', '2026-08-22T19:52:50.000Z');
    expect(tail([asked, answered])).toBe('answered');
    // The live shape: a failed turn, then the retype, then the reply. The
    // conversation is answered and the retry must not still be offered.
    expect(tail([asked, failed, asked, answered])).toBe('answered');
  });

  it('steps over the events that are not about whether an answer arrived', () => {
    const built: Turn = { role: 'event', kind: 'built', text: 'Started watching x.', at: '2026-08-22T19:54:00.000Z' };
    expect(tail([asked, answered, built])).toBe('answered');
    expect(tail([asked, turnFailed('gone', 'now'), built])).toBe('failed');
  });

  it('is empty for a conversation with no turns', () => {
    expect(tail([])).toBe('empty');
  });

  it('carries the failure into the export, where the transcript is audited', () => {
    // The export is the only copy of this conversation that outlives the tab,
    // and "the question was asked and never answered" is a fact about this
    // instance. `toMarkdown` renders an event as a quoted line, so the new
    // kind needs nothing of its own -- this asserts that it does not need it.
    const md = toMarkdown({
      id: 1,
      title: 'watch',
      scraperSlug: null,
      turns: [asked, turnFailed('Assay did not answer this message.', 'now')],
      createdAt: new Date(0),
      updatedAt: new Date(0),
    });
    expect(md).toContain('Assay did not answer this message.');
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
