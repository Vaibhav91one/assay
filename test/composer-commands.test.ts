// `/` commands in the chat: what a turn stores, what a re-read shows, and what
// a hostile page can reach from inside a held cell.
//
// Almost all of this is database behaviour, so almost all of it early-returns
// without Postgres -- which vitest reports as PASSED, not skipped. Run it with
// ASSAY_REQUIRE_DB=1 or it is asserting nothing.
//
// THE PROPERTY THE WHOLE FEATURE RESTS ON is that a command turn holds the
// QUESTION and never the ROWS. `/fields` reads live every time it is
// rendered; a transcript that kept a copy of "3 held" would keep saying
// three long after the store moved on. Everything below is a way of asking
// whether that is still true.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  COMMANDS, commandIn, commandTurn, historyFor, tail, toMarkdown, type Turn,
} from '../src/store/conversation-log.js';
import { getDb, closeDb, targets, runs, fieldRuns, queueItems, sql } from '../src/store/index.js';
import { readCommandView } from '../web/lib/commands.js';

const ROOT = new URL('../', import.meta.url);
const read = (p: string) => readFileSync(fileURLToPath(new URL(p, ROOT)), 'utf8');

const SLUG = 't_chatcmd';
const TARGET = `${SLUG}__recall_title`;
const PROOF = 'pr_chatcmd_1';

let dbUp = false;

async function wipe() {
  const d = getDb();
  await d.execute(sql`DELETE FROM queue_items WHERE proof_id LIKE 'pr_chatcmd_%'`);
  await d.execute(sql`DELETE FROM field_runs WHERE proof_id LIKE 'pr_chatcmd_%'`);
  await d.execute(sql`DELETE FROM runs WHERE target_id = ${TARGET}`);
  await d.execute(sql`DELETE FROM targets WHERE target_id = ${TARGET}`);
}

async function seed() {
  const d = getDb();
  await d.insert(targets).values({
    targetId: TARGET, url: 'https://example.invalid/recalls', contract: {},
  }).onConflictDoNothing();
  const [run] = await d.insert(runs)
    .values({ targetId: TARGET, status: 'quarantined' })
    .returning({ runId: runs.runId });
  const runId = run!.runId;

  await d.insert(fieldRuns).values({
    runId,
    field: 'recall_title',
    value: null,
    status: 'quarantined',
    reason: 'thin_margin',
    proofId: PROOF,
    heldSinceRun: runId,
    groupKey: null,
  });
  await d.insert(queueItems).values({ proofId: PROOF, stakesRows: 1 });
}

beforeAll(async () => {
  try {
    const d = getDb();
    await d.execute(sql`SELECT 1`);
    dbUp = true;
    await wipe();
    await seed();
  } catch {
    dbUp = false;
  }
});

afterAll(async () => {
  if (dbUp) await wipe();
  await closeDb();
});

// --- what is typed ------------------------------------------------------------

describe('a command is a closed set, not a string the operator composes', () => {
  it('reads the two names', () => {
    for (const name of COMMANDS) {
      expect(commandIn(`/${name}`)).toEqual({ kind: 'command', name, args: '' });
    }
  });

  it('refuses a name that is not one of them, rather than guessing', () => {
    // Not `{ kind: 'message' }`: a message beginning with a slash is a command
    // attempt, and posting it to the agent as a sentence is the silent failure.
    // `/decisions` and `/held` are gone with the decide-queue -- they refuse
    // the same as any other unknown name now, not a special case.
    expect(commandIn('/decisions')).toEqual({ kind: 'unknown' });
    expect(commandIn('/held')).toEqual({ kind: 'unknown' });
    expect(commandIn('/deciisons')).toEqual({ kind: 'unknown' });
    expect(commandIn('/')).toEqual({ kind: 'unknown' });
    expect(commandIn('/../../etc/passwd')).toEqual({ kind: 'unknown' });
    expect(commandIn('/fields; DROP TABLE field_runs')).toEqual({ kind: 'unknown' });
  });

  it('keeps a URL a message, because a slash inside one is not a command', () => {
    expect(commandIn('watch https://example.com/fields')).toEqual({ kind: 'message' });
    expect(commandIn('https://example.com/runs')).toEqual({ kind: 'message' });
  });

  it('carries the words typed after the name without interpreting them', () => {
    expect(commandIn('/fields what about the second one?'))
      .toEqual({ kind: 'command', name: 'fields', args: 'what about the second one?' });
  });
});

// --- what the turn stores -----------------------------------------------------

describe('a command turn carries the query and never the rows', () => {
  it('stores the command name, the argument, and nothing else', () => {
    const turn = commandTurn('fields', '', '2026-08-23T10:00:00.000Z');
    // Six keys and a closed list of them, so a "just cache the rows" field
    // cannot arrive here without this failing.
    expect(Object.keys(turn).sort()).toEqual(['args', 'at', 'command', 'kind', 'role', 'text']);
    expect(turn).toMatchObject({ role: 'event', kind: 'command', command: 'fields', args: '' });
    // `text` is the export's line about the absence, not a rendering of rows.
    expect(turn).toHaveProperty('text', expect.stringContaining('not recorded in this transcript'));
  });

  it('has nowhere to put a row, a proof id, a value or a count', async () => {
    if (!dbUp) return;
    // The rows exist, and this is what the turn made of them: nothing. The
    // assertion is deliberately over the SERIALISED turn, because that is what
    // reaches Postgres and what a later reader gets back.
    const r = await readCommandView('fields');
    expect(r.ok && r.view.command === 'fields' && r.view.fields.length).toBeGreaterThanOrEqual(0);

    const json = JSON.stringify(commandTurn('fields', ''));
    expect(json).not.toContain(PROOF);
    expect(json).not.toContain(TARGET);
    expect(json).not.toContain('recall_title');
  });

  it('is stepped over by `tail`, so a listing is never mistaken for an answer', () => {
    const asked: Turn = { role: 'operator', text: 'hello', at: 'now' };
    const answered: Turn = { role: 'assay', text: 'hi', at: 'now' };
    // A command went to the store, not to a model, so it neither answers a
    // question nor leaves one hanging -- and it must not offer "ask again".
    expect(tail([asked, answered, commandTurn('runs', '')])).toBe('answered');
    expect(tail([commandTurn('runs', '')])).toBe('empty');
  });

  it('tells the export that the rows are not in it', () => {
    const md = toMarkdown({
      id: 1,
      title: 'x',
      scraperSlug: null,
      turns: [commandTurn('fields', '')],
      createdAt: new Date(0),
      updatedAt: new Date(0),
    });
    expect(md).toContain('/fields');
    expect(md).toContain('not recorded in this transcript');
  });
});

// --- the live read ------------------------------------------------------------

describe('the panel reads the store, so an old turn cannot go stale', () => {
  it('shows the held field in the live count, with no candidate value attached', async () => {
    if (!dbUp) return;
    const r = await readCommandView('fields');
    expect(r.ok).toBe(true);
    if (!r.ok || r.view.command !== 'fields') throw new Error('unreachable');

    const row = r.view.fields.find((x) => x.targetId === TARGET);
    expect(row).toBeDefined();
    expect(row!.held).toBeGreaterThan(0);
    // No candidate list, no raw scraped text -- that surface left with the
    // decide-queue. A `FieldRow` has nowhere for it to arrive.
    expect(Object.keys(row!)).not.toContain('candidates');
  });

  it('refuses a command name it does not have, with the ones it does', async () => {
    const r = await readCommandView('deciisons' as never);
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('unreachable');
    for (const c of COMMANDS) expect(r.detail).toContain(`/${String(c)}`);
  });
});

// --- the injection vector -----------------------------------------------------

describe('the chat has no candidate-rendering surface left to attack', () => {
  it('has no ride into the model\'s context, because the turn carries no value', () => {
    // `historyFor` is what the composer sends the agent. Events are dropped, and
    // since commands became events that is a security property as well as a
    // tidiness one: even a follow-up question typed straight after `/fields`
    // is sent with the operator's own words and nothing the store holds.
    const turns: Turn[] = [
      { role: 'operator', text: 'what is waiting on me?', at: 'now' },
      commandTurn('fields', ''),
      { role: 'operator', text: 'and the second one?', at: 'now' },
    ];
    const { history } = historyFor(turns);
    expect(history).toEqual([
      { role: 'operator', text: 'what is waiting on me?' },
      { role: 'operator', text: 'and the second one?' },
    ]);
  });

  it('cannot reach a resolve, because the chat surface has no writer to reach', () => {
    // Source text, and it is the right instrument: the property is "this module
    // contains no write", which is exactly what is being read. The chat's read
    // action must not import a writer, and the agent must not be handed a tool
    // that is one.
    const action = read('web/app/(app)/command-actions.ts');
    expect(action).not.toMatch(/\b(resolveCell|undoCell|resolve|undo|askForRun)\s*\(/);
    expect(action).toContain('assertOperator()');

    const agent = read('src/agent/index.ts');
    // The allowlist is membership. Two read tools, and `assay_resolve` does not
    // exist anywhere to be added to it.
    expect(agent).toContain("allowedTools: ['mcp__assay__assay_watching', 'mcp__assay__assay_inspect']");
    // No tool is DECLARED that could settle anything.
    expect(agent).not.toMatch(/tool\(\s*\n?\s*'assay_(resolve|undo|propose|clear_brake|unheal|decisions)'/);
    // The reply channel stays two words wide. A model that could write a
    // sentence could be made to write the page's sentence.
    expect(agent).toMatch(/say: z\.enum\(SAYINGS\)\.nullable\(\)/);
    expect(agent).toMatch(/const SAYINGS = \['proposal_waiting', 'page_read'\] as const/);
  });
});

// --- what the new surfaces render ---------------------------------------------

describe('the chat surfaces carry no number the product refuses to show', () => {
  /** Comments are not rendered, and this is about what an operator sees. */
  const code = (p: string) =>
    read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  for (const f of [
    'web/app/(app)/command-turn.tsx',
    'web/app/(app)/composer.tsx',
    'web/components/composer-shortcuts.tsx',
  ]) {
    it(`${f} shows no score, margin, tau or delta`, () => {
      // docs/FEATURES.md 4 refuses a confidence number, and a band word is what
      // is allowed instead -- `grade`, `heldBecause`, `assayScore`. A raw
      // number here would be the product arguing with itself.
      expect(code(f)).not.toMatch(/\b(score|margin|tau|delta)\b/i);
    });
  }

  it('the mode dropdown still cannot navigate, retype or push history', () => {
    const src = read('web/components/composer-shortcuts.tsx');
    expect(src).not.toMatch(/(?:useRouter|router\.|history\.|href=|<Link)/);
    // The caret stays in the writing surface: the trigger and every option
    // prevent the pointer from taking focus, and `Composer` restores it for
    // keyboard and touch.
    expect((src.match(/onMouseDown=\{\(e\) => e\.preventDefault\(\)\}/g) ?? []).length)
      .toBeGreaterThanOrEqual(2);
    expect(src).not.toContain('setText');
    // Motion comes from the product's own popover class and its tokens, not
    // from a hand-rolled duration. docs/MOTION.md 3.
    expect(src).toContain('motion-pop-in');
    expect(src).not.toMatch(/duration-\[?\d+m?s?\]?/);
    // Colour comes from the token file, never a literal.
    expect(src).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  });

  it('the command panel imports the actions that already own the writes', () => {
    const panel = read('web/app/(app)/command-turn.tsx');
    // A whole component, not a re-implementation: `RunNow` carries the paused
    // refusal and the worker-liveness sentence. There is no `DecisionsList`
    // any more -- the decide-queue's screen is gone with it.
    expect(panel).toContain("from './schedule/run-now'");
    expect(panel).not.toContain('decisions-list');
    expect(panel).not.toMatch(/\b(resolve|undo|askForRun)\s*\(/);
  });
});
