// Server-only. Opens a Postgres pool; see web/lib/queue.ts on why
// `server-only` is deliberately not a dependency.
//
// WHY THIS IS NOT IN THE SERVER ACTION IT SERVES. `web/app/(app)/command-actions.ts`
// is a `'use server'` module: it imports `@/lib/auth` through the tsconfig path
// alias and `next/cache`, neither of which the ROOT tsconfig knows about -- so a
// test importing it makes `npx tsc --noEmit` fail on the whole repo, and calling
// it makes `revalidatePath` throw for want of a request. `test/actions-auth.ts`
// works around that with a computed import path, which is right for what it does
// (call every export and check it refuses) and useless for asserting what a read
// returns. So the read lives here, where a test imports it like any other
// module, and the action above it is the auth wrapper and nothing else.

import { getDb, workersUp } from 'assay/store';
import * as schema from 'assay/engine/store/schema';
import { COMMANDS, type CommandName } from 'assay/engine/store/conversation-log';
// `.js` on a relative import, which is what the ROOT tsconfig requires
// (`moduleResolution: node16`) and what Next resolves back to the `.ts` through
// its own extension alias. No other module in `web/lib` imports a sibling, so
// there was no house style to follow -- this is the spelling that satisfies both
// type-checkers rather than only the one that runs in `web/`.
import { fieldsView, type FieldRow } from './fields.js';
import { runsView, type RunRow } from './runs.js';

/**
 * What a `/` command in the chat reads, every time it is rendered.
 *
 * THE READ IS LIVE AND THE TURN HOLDS NOTHING. `src/store/conversation-log.ts`
 * states why: a transcript that froze "3 fields held" into a message would be
 * wrong the moment the worker's next run changed that number. So a command turn
 * stores the command, the screen calls this on every mount, and what an operator
 * scrolls back to is what the store says now -- a `/fields` turn from an hour
 * ago reads the current held count, not the one from when it was typed.
 *
 * NOTHING HERE IS A NEW READ. `/fields` is `fieldsView()`, `/runs` is
 * `runsView()` -- the same reads those screens themselves call. A second query
 * answering the same question is how two surfaces come to disagree about what
 * is held, which is the failure this product exists to refuse.
 *
 * NOTHING HERE WRITES, either. Asking for a run is `askForRun` in
 * `./schedule/actions.ts` -- the same action that screen calls, reached from a
 * button a person pressed. There is deliberately no write in this file: a second
 * writer is the drift `tools/sweep.ts` was cleaned of, and an agent that could
 * reach one would be the authority `docs/FEATURES.md` refuses it. `/fields` has
 * no action at all because the Fields screen has none -- there is no
 * `web/app/(app)/fields/actions.ts` to import, and that is a fact about the
 * product rather than a gap to fill from a chat box.
 *
 * THE NAME IS A MEMBERSHIP TEST. `CommandName` is a closed union and this
 * re-checks it at runtime, because a Server Action is reachable by POST with a
 * body of the caller's choosing and a type is not a guard there. An unknown name
 * is refused with the real ones rather than guessed at, and no branch below
 * interpolates the argument into anything.
 *
 * WHAT IT COSTS. `/fields` runs `fieldsView`, which re-parses stored captures to
 * grade each field -- the same seconds the Fields screen pays. A transcript with
 * several `/fields` in it pays that per command, per render. If that becomes the
 * slow thing, the fix is a lighter read for the chat panel, NOT a cached copy in
 * the turn: the copy is the lie this design exists to avoid.
 */
export type CommandView =
  | { command: 'fields'; fields: FieldRow[]; tracked: number; fragile: number }
  | {
      command: 'runs';
      runs: RunRow[];
      total: number;
      healed: number;
      held: number;
      /** What `RunNow` needs to offer a run request. One entry per scraper. */
      scrapers: { slug: string; paused: boolean; fields: number }[];
      /** Workers consuming this queue, read now. Zero is a sentence, not a spinner. */
      workers: number;
    };

export type CommandResult =
  | { ok: true; view: CommandView }
  | { ok: false; detail: string };

export async function readCommandView(name: CommandName): Promise<CommandResult> {
  if (!(COMMANDS as readonly string[]).includes(name)) {
    return {
      ok: false,
      detail: `Assay has no ${'/'}${String(name).slice(0, 24)} command. `
        + `The commands are ${COMMANDS.map((c) => `/${c}`).join(', ')}.`,
    };
  }

  if (name === 'fields') {
    const v = await fieldsView('all');
    return {
      ok: true,
      view: { command: 'fields', fields: v.rows, tracked: v.tracked, fragile: v.fragile },
    };
  }

  const [v, scrapers, workers] = await Promise.all([runsView('all', 12), runScrapers(), workersUp()]);
  return {
    ok: true,
    view: {
      command: 'runs',
      runs: v.rows,
      total: v.total,
      healed: v.healed,
      held: v.held,
      scrapers,
      workers,
    },
  };
}

/**
 * The scrapers a run could be asked for, one row per page rather than per field.
 *
 * `{slug}__{field}` is a target row, and `askForRun` moves every row under a
 * slug -- so the control is per scraper, exactly as `web/lib/scrapers.ts`
 * groups them for the Schedule screen. Pause is the absence of a next run
 * (`src/setup/index.ts` rule 3), so a scraper is paused only when every one of
 * its rows is; `askForRun` refuses a paused one and says why, which is a
 * sentence worth reaching rather than a control worth hiding.
 */
async function runScrapers(): Promise<{ slug: string; paused: boolean; fields: number }[]> {
  const rows = await getDb()
    .select({ id: schema.targets.targetId, nextRunAt: schema.targets.nextRunAt })
    .from(schema.targets)
    .orderBy(schema.targets.targetId);

  const bySlug = new Map<string, { slug: string; paused: boolean; fields: number }>();
  for (const r of rows) {
    const slug = r.id.split('__')[0];
    if (!slug) continue;
    const seen = bySlug.get(slug) ?? { slug, paused: true, fields: 0 };
    seen.fields += 1;
    if (r.nextRunAt !== null) seen.paused = false;
    bySlug.set(slug, seen);
  }
  return [...bySlug.values()];
}
