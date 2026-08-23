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

import {
  MODELS as ENGINE_MODELS, candidatesOn, converse, render, type TraceEvent,
} from '../src/agent/index.js';
import { MODELS, MODEL_LABEL, DEFAULT_MODEL } from '../src/agent/models.js';
import { HELD_BECAUSE, heldBecause } from '../src/reports/vocabulary.js';

import { readFileSync } from 'node:fs';
import {
  conversationInUrl, tail, turnFailed, toMarkdown, whyFailed, WHY_CHARS, type Turn,
} from '../src/store/conversation-log.js';

import {
  SHORTCUTS, menuAt, openCommands, shortcutMessage, withoutOrphanSlash,
} from '../web/lib/composer-menu.js';
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

describe('composer shortcuts', () => {
  it('offers exactly the six approved presentation modes', () => {
    expect(SHORTCUTS.map((s) => s.label)).toEqual([
      'Watch', 'Research', 'Build API', 'Automate', 'Compare locations', 'AI visibility',
    ]);
  });

  it('adjusts the existing message string rather than creating a request shape', () => {
    for (const shortcut of SHORTCUTS) {
      expect(shortcutMessage('Keep my typed words', shortcut.id))
        .toBe(`${shortcut.label}: Keep my typed words`);
    }
    expect(shortcutMessage('Keep my typed words', null)).toBe('Keep my typed words');
  });

  it('keeps the shortcut row free of navigation and preserves composer focus structurally', async () => {
    const { readFile } = await import('node:fs/promises');
    const src = await readFile(
      new URL('../web/components/composer-shortcuts.tsx', import.meta.url),
      'utf8',
    );
    expect(src).not.toMatch(/(?:useRouter|router\.|history\.|href=|<Link)/);
    expect(src).toContain('type="button"');
    expect(src).toContain('aria-pressed={selected === shortcut.id}');
    expect(src).toContain('e.preventDefault()');

    const composer = await readFile(
      new URL('../web/app/(app)/composer.tsx', import.meta.url),
      'utf8',
    );
    const selection = composer.slice(composer.indexOf('function selectShortcut'));
    expect(selection).toContain('box.current?.focus()');
    expect(selection).not.toContain('setText(');
    expect(selection).not.toContain('router.');
  });
});

describe('menuAt', () => {
  it('opens on a slash at the start of the box', () => {
    expect(menuAt('/', 1)).toEqual({ from: 0, query: '' });
    expect(menuAt('/de', 3)).toEqual({ from: 0, query: 'de' });
  });

  it('opens on a slash after a space', () => {
    expect(menuAt('and then /dec', 13)).toEqual({ from: 9, query: 'dec' });
  });

  it('does NOT open on a slash inside a URL', () => {
    // The case that makes the start-of-word rule worth having, and the reason
    // it outlived `@`: this box exists to receive pasted URLs.
    expect(menuAt('https://example.com/recalls', 27)).toBeNull();
    expect(menuAt('watch https://x.com/a/b', 23)).toBeNull();
  });

  it('does NOT open on an email address, which no longer has a menu to open', () => {
    expect(menuAt('mail me at you@example.com', 26)).toBeNull();
  });

  it('closes once a space is typed', () => {
    expect(menuAt('/runs ', 6)).toBeNull();
  });

  it('reads the caret, not the end of the string', () => {
    expect(menuAt('/runs and more', 3)).toEqual({ from: 0, query: 'ru' });
  });

  it('is closed when there is no caret', () => {
    expect(menuAt('/runs', null)).toBeNull();
  });
});

// The owner, from live use: "whenever you click on @ and /, it enters the
// prompt bar multiple times." Reproduced on the running instance -- three
// deliberate clicks left three sigils in the message. One character per click,
// so nothing was firing twice; the button opens the menu by TYPING the sigil,
// and it typed another one every time whether a menu was open or not.
describe('openCommands', () => {
  it('opens the menu on an empty box', () => {
    expect(openCommands('', 0)).toEqual({ value: '/', caret: 1 });
  });

  it('does not type a second slash when the menu is already open', () => {
    // The reported bug, at the size it actually is.
    let v = openCommands('', 0);
    for (let i = 0; i < 5; i++) v = openCommands(v.value, v.caret);
    expect(v).toEqual({ value: '/', caret: 1 });

    // With a query typed into the open menu, the query survives untouched --
    // re-opening a menu must not throw away what was typed into it.
    expect(openCommands('/dec', 4)).toEqual({ value: '/dec', caret: 4 });
  });

  it('starts a word, because that is where menuAt looks for a slash', () => {
    const r = openCommands('watch', 5);
    expect(r.value).toBe('watch /');
    expect(r.caret).toBe(7);
    // The proof that the pad is not cosmetic: without it there is no menu.
    expect(menuAt(r.value, r.caret)).toEqual({ from: 6, query: '' });
    expect(menuAt('watch/', 6)).toBeNull();
  });

  it('adds no pad after whitespace or at the start', () => {
    expect(openCommands('watch ', 6)).toEqual({ value: 'watch /', caret: 7 });
    expect(openCommands('a\n', 2)).toEqual({ value: 'a\n/', caret: 3 });
  });

  it('inserts at the caret and keeps what follows it', () => {
    expect(openCommands('hello world', 5)).toEqual({ value: 'hello / world', caret: 7 });
  });

  it('closes a menu the caret has left, rather than treating it as open', () => {
    expect(menuAt('/dec ', 5)).toBeNull();
    expect(openCommands('/dec ', 5)).toEqual({ value: '/dec /', caret: 6 });
  });
});

// The owner's transcript read `@ / @assay-testbed-...`: sigil buttons pressed
// while hunting for a picker, and the orphans rode into the message and then
// into the model's prompt as noise.
describe('withoutOrphanSlash', () => {
  it('takes a slash that names no command', () => {
    expect(withoutOrphanSlash('/ watch this page')).toBe('watch this page');
    expect(withoutOrphanSlash('watch this /')).toBe('watch this');
    expect(withoutOrphanSlash('/ / watch')).toBe('watch');
  });

  it('leaves a command alone', () => {
    expect(withoutOrphanSlash('/decisions')).toBe('/decisions');
    expect(withoutOrphanSlash(' /runs ')).toBe('/runs');
  });

  it('leaves a URL alone, every slash of it', () => {
    expect(withoutOrphanSlash('watch https://x.com/a/b')).toBe('watch https://x.com/a/b');
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
// --- which conversation a URL has open ---------------------------------------
//
// REPORTED. "New scrape" links to `/?new=1`; the home page typed its search
// params as `{ c?: string }` and never read `new`, so pressing it left whatever
// conversation was already loaded on the screen and the operator's next message
// landed in it. The rule now lives in one function that both the server page and
// the browser's late-render guard call.

describe('?new=1 opens a new conversation, and touches no old one', () => {
  it('resolves to Home, which is a conversation that does not exist yet', () => {
    expect(conversationInUrl({ new: '1' })).toBeNull();
    expect(conversationInUrl({})).toBeNull();
  });

  it('beats a `c` that is still in the URL', () => {
    // The button is the more recent thing the operator did. Without this the
    // two readers disagree -- the page loads Home while the client's guard
    // still believes conversation 5 is open -- and a disagreement is how the
    // stale transcript survived in the first place.
    expect(conversationInUrl({ c: '5', new: '1' })).toBeNull();
  });

  it('still opens the conversation a plain `?c=` names', () => {
    expect(conversationInUrl({ c: '5' })).toBe(5);
    // Not a number is not a conversation, and resolves to Home rather than to
    // a 404 on a link to something deleted.
    expect(conversationInUrl({ c: 'abc' })).toBeNull();
    expect(conversationInUrl({ c: '5x' })).toBeNull();
  });

  it('is the only thing either side reads a conversation id with', () => {
    // Source text, because both readers are `.tsx` behind Next's path aliases.
    // What matters is that neither has its own parse to drift -- the client's
    // `openedInUrl` used to hold a second copy of this regex.
    for (const f of ['web/app/(app)/page.tsx', 'web/app/(app)/watch.tsx']) {
      const src = readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
      expect(src).toContain('conversationInUrl');
      expect(src).not.toMatch(/get\('c'\)[\s\S]{0,80}\/\^\\d\+\$\//);
    }
  });

  it('creates no row, so nothing appears in the rail before anyone types', () => {
    // A conversation exists from its FIRST MESSAGE. The home page must not open
    // one, and does not: it only ever reads.
    const src = readFileSync(new URL('../web/app/(app)/page.tsx', import.meta.url), 'utf8');
    expect(src).not.toMatch(/openConversation|createConversation|recordTurns/);
  });
});

// --- no machinery on the screen ----------------------------------------------

describe('nothing the operator reads carries a raw number from the gate', () => {
  // FEATURES.md 4 refuses a percentage and the screens refuse the vocabulary
  // behind it. A confidence is `high`, `medium` or `low`; a held cell has a
  // reason in words. A tau, a margin, a delta or a score is a fact about the
  // engine's internals and belongs in the proof record, not in a sentence.
  const MACHINERY = /\b(?:tau|delta|margin|score)\b|(?:^|\s)0\.\d+/i;

  it('is absent from every screen this change touched', () => {
    for (const f of [
      'web/app/(app)/page.tsx',
      'web/app/(app)/watch.tsx',
      'web/app/(app)/library/page.tsx',
      'web/app/(app)/library/[entry]/page.tsx',
      'web/components/brand-mark.tsx',
    ]) {
      const src = readFileSync(new URL(`../${f}`, import.meta.url), 'utf8')
        // Comments come out first: a note may legitimately name the machinery
        // it is explaining. What is left is what can reach a screen.
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
      expect([f, /\b(?:tau|delta|margin|score)\b/i.test(src)]).toEqual([f, false]);
    }
  });

  it('is absent from every sentence the agent composes', () => {
    // The replies themselves rather than their source, so a branch that only
    // exists at runtime is covered too. `render` has five.
    const pages = ['https://www.youtube.com/'];
    const cands = candidatesOn('<body><span class="f">© 2026 Example Inc</span>'
      + '<p class="p">$49.99</p></body>');
    const fetched = new Map([[0, cands]]);
    const idx = (cls: string) => cands.findIndex((c) => (c.classes_stable ?? []).includes(cls));
    const base = { url: 0 as number | null, cadence: 'daily' as const, say: null };

    const replies = [
      render({ ...base, kind: 'answer', say: 'proposal_waiting', fields: [] }, pages, fetched),
      render({ ...base, kind: 'answer', say: 'page_read', fields: [] }, pages, fetched),
      render({ ...base, kind: 'need_url', url: null, fields: [] }, [], new Map()),
      render({ ...base, kind: 'need_fields', fields: [] }, pages, fetched),
      // All furniture, and then a real value with a low confidence beside it.
      render({ ...base, kind: 'propose', fields: [{ name: 'foot', candidate: idx('f'), confidence: 'high' }] }, pages, fetched),
      render({ ...base, kind: 'propose', fields: [{ name: 'price', candidate: idx('p'), confidence: 'low' }] }, pages, fetched),
    ].map((r) => r.reply);

    expect(replies.filter((s) => MACHINERY.test(s))).toEqual([]);
    // And the low-confidence one still SAYS it is unsure, in words.
    expect(replies.at(-1)).toMatch(/least sure/);
  });
});

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

// --- a transcript that cannot be saved --------------------------------------

/**
 * The bodies of the `catch (e) {...}` and `catch {...}` blocks in a source file.
 *
 * Brace-matched rather than regexed to the closing brace, because a catch body
 * here contains braces of its own -- a template literal, an arrow function --
 * and a lazy `[\s\S]*?\}` stops at the first of them and reports a body that
 * looks empty. The lookbehind is what keeps `.catch(() => {})` out: that is a
 * promise handler, not a catch block, and it is the correct shape for a
 * fire-and-forget write.
 */
function catchBodies(src: string): string[] {
  const out: string[] = [];
  for (const m of src.matchAll(/(?<![.\w])catch\s*(?:\([^)]*\)\s*)?\{/g)) {
    let depth = 1;
    let i = m.index + m[0].length;
    for (; i < src.length && depth > 0; i++) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}') depth--;
    }
    out.push(src.slice(m.index + m[0].length, i - 1));
  }
  return out;
}

describe('a conversation that cannot be saved says so while the operator is still in it', () => {
  const src = readFileSync(new URL('../web/app/(app)/watch.tsx', import.meta.url), 'utf8');

  /**
   * THE REGRESSION, AND IT COST A WHOLE CONVERSATION. `openConversation` threw
   * -- `relation "conversations" does not exist`, from an instance whose
   * DATABASE_URL was unset and had fallen back to a database that predates the
   * `conversations` migration -- and the catch on the persistence path was
   * `catch { id = convId; }`. The id stayed null, so every later message
   * retried and failed identically, and four exchanges left zero rows. The
   * operator was told nothing at the time and found out on reload, by absence.
   *
   * Source text, because there is no DOM in this suite and the property is
   * about what the component does with an error rather than about what any one
   * render looks like. What it pins is the shape that cannot come back: a catch
   * on this screen that swallows.
   */
  it('leaves a failed turn behind in every catch, and discards none of them', () => {
    const bodies = catchBodies(src);
    // A guard on the guard: a regex that matched nothing would pass silently.
    expect(bodies.length).toBeGreaterThanOrEqual(3);
    for (const body of bodies) {
      expect([body, /failed\(|turnFailed\(/.test(body)]).toEqual([body, true]);
    }
  });

  it('never swallows a failed create by resetting the id and saying nothing', () => {
    expect(src).not.toMatch(/catch\s*(?:\([^)]*\)\s*)?\{\s*(?:\/\/[^\n]*\n\s*)*id = convId;\s*\}/);
  });

  /**
   * The sentence carries the driver's own message, which is what turns "this
   * was not saved" into "this was not saved BECAUSE the table is not there".
   * That is the difference between an operator who reloads and loses four
   * messages and an operator who runs the migration.
   */
  it('names what went wrong, so the next misconfiguration is readable at the time', () => {
    expect(src).toMatch(/could not save this message: \$\{why\(e\)\}/);
    expect(src).toMatch(/could not save this command: \$\{why\(e\)\}/);
  });

  /**
   * The half of the sentence a person can act on, against the real shape the
   * store throws. `Failed query: insert into "conversations" (...) params: ...`
   * is drizzle's wrapper and it carries the operator's own message and the turn
   * JSON after it; `relation "conversations" does not exist` is the cause, and
   * the cause is the reason the conversation was lost.
   */
  it('takes the store error over the wrapper that repeats the transcript back', () => {
    const wrapped = new Error(
      'Failed query: insert into "conversations" ("conversation_id", "title", "turns") '
      + 'values (default, $1, $2) returning "conversation_id"\nparams: Build API: '
      + 'https://www.youtube.com/,[{"role":"operator","text":"Build API: https://www.youtube.com/"}]',
      { cause: new Error('relation "conversations" does not exist') },
    );
    expect(whyFailed(wrapped)).toBe('relation "conversations" does not exist');
    // No cause is the browser's own transport error, which is already a clause.
    expect(whyFailed(new Error('Failed to fetch'))).toBe('Failed to fetch');
    // A throw that is not an Error at all still says something.
    expect(whyFailed('nope')).toBe('nope');
  });

  it('bounds the clause, so one line stays one line', () => {
    const long = new Error('x'.repeat(WHY_CHARS + 50));
    expect(whyFailed(long)).toHaveLength(WHY_CHARS + 1);
    expect(whyFailed(long).endsWith('…')).toBe(true);
    // Newlines out: a transcript line is a line.
    expect(whyFailed(new Error('a\n  b'))).toBe('a b');
  });

  // The property the old comment was reaching for, kept: a store that is down
  // does not stop the agent answering. Answering while VISIBLY unsaved is fine.
  it('still reads as answered once the reply lands, so no retry is offered', () => {
    const asked: Turn = { role: 'operator', text: 'Build API: https://www.youtube.com/', at: '2026-08-23T11:38:29.316Z' };
    const unsaved = turnFailed(
      'Assay could not save this message: relation "conversations" does not exist.',
      '2026-08-23T11:38:29.400Z',
    );
    const answered: Turn = { role: 'assay', text: 'I can watch that.', at: '2026-08-23T11:38:40.000Z' };
    expect(tail([asked, unsaved, answered])).toBe('answered');
    // And before the reply arrives it is a failure like any other, which is the
    // state that offers "Ask again".
    expect(tail([asked, unsaved])).toBe('failed');
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
