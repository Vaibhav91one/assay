// `assay brake` and `assay unheal`, as commander command modules.
//
// This file exports the commands; `bin/assay.ts` registers them. Nobody but
// feature I edits the binary (docs/DEV-OWNERSHIP.md), so the seam is a value,
// not an import into a shared list.

import { Command } from 'commander';
import { z } from 'zod';
import {
  listBrakes, brakeState, clearBrake, checkBrake, healsFor, unheal, detectPingPong,
} from '../../src/brake/index.js';
import { closeDb } from '../../src/store/index.js';

/**
 * `target/field`, the form F10 and F11 are drawn with (`assay unheal ikea/price`).
 * Parsed at the boundary: a bare word here would silently become a target with
 * an empty field name and a query that quietly matches nothing.
 */
const Ref = z.string().regex(/^[^/]+\/[^/]+$/, 'expected target/field, e.g. ikea/price');

const split = (ref: string): { targetId: string; field: string } => {
  const parsed = Ref.safeParse(ref);
  if (!parsed.success) {
    console.error(z.prettifyError(parsed.error));
    process.exit(2);
  }
  const [targetId, field] = parsed.data.split('/');
  return { targetId: targetId!, field: field! };
};

const out = (v: unknown): void => { console.log(JSON.stringify(v, null, 2)); };

/** Every command here opens a pool; none of them is long-lived. */
const run = <A extends unknown[]>(fn: (...args: A) => Promise<number | void>) =>
  async (...args: A): Promise<void> => {
    try {
      process.exitCode = (await fn(...args)) ?? 0;
    } finally {
      await closeDb().catch(() => {});
    }
  };

export const brakeCommand = new Command('brake')
  .description('Fields where healing has been stopped because the selector oscillates (F11).');

brakeCommand
  .command('list', { isDefault: true })
  .description('Every active brake.')
  .action(run(async () => {
    const brakes = await listBrakes();
    if (!brakes.length) { console.log('No field is braked. Healing is unrestricted.'); return; }
    for (const b of brakes) {
      console.log(`${b.targetId}/${b.field}  braked ${b.updatedAt.toISOString()}`);
      console.log(`  ${b.brakeReason}`);
      console.log(`  clear: assay brake clear ${b.targetId}/${b.field} --confirm ${b.field}`);
    }
  }));

brakeCommand
  .command('check <ref>')
  .description('Look at one field\'s heal history and brake it if it is thrashing.')
  .action(run(async (ref: string) => {
    const { targetId, field } = split(ref);
    out(await checkBrake(targetId, field));
  }));

brakeCommand
  .command('history <ref>')
  .description('Every heal for one field, reverted ones included.')
  .action(run(async (ref: string) => {
    const { targetId, field } = split(ref);
    const rows = await healsFor(targetId, field);
    out({ target: targetId, field, heals: rows, verdict: detectPingPong(rows) });
  }));

brakeCommand
  .command('clear <ref>')
  .description('Resume healing. Requires --confirm with the field name typed out.')
  .requiredOption('--confirm <field>', 'the field name, typed. Not a flag with a default.')
  .option('--by <who>', 'who is clearing it', process.env.USER ?? 'unknown')
  .action(run(async (ref: string, opts: { confirm: string; by: string }) => {
    const { targetId, field } = split(ref);

    // Said before the prompt, not after: the operator should know what they are
    // buying before they type the word, which is the only reason typing it is
    // better than clicking a button.
    const state = await brakeState(targetId, field);
    if (!state?.brakeActive) {
      console.error(`No active brake on ${targetId}/${field}.`);
      return 1;
    }
    console.error(`Clearing this brake resumes automatic healing on ${targetId}/${field}.`);
    console.error(`It was braked because: ${state.brakeReason}`);
    console.error('If the site is still running an experiment, the next heal will publish '
      + 'from whichever variant it lands on, and nothing will hold it.');

    const result = await clearBrake({ targetId, field, confirm: opts.confirm, clearedBy: opts.by });
    if (!result.cleared) {
      console.error(result.reason === 'confirmation_mismatch'
        ? `Refused: --confirm must be exactly "${field}".`
        : `No active brake on ${targetId}/${field}.`);
      return 1;
    }
    out(result);
  }));

export const unhealCommand = new Command('unheal')
  .description('Revert a field to its last verified selector and re-open blast radius (F10).')
  .argument('<ref>', 'target/field, e.g. ikea/price')
  .option('--run <n>', 'which heal was wrong, by run id. Default: the most recent one.')
  .action(run(async (ref: string, opts: { run?: string }) => {
    const { targetId, field } = split(ref);

    let runId: number | undefined;
    if (opts.run !== undefined) {
      const n = z.coerce.number().int().positive().safeParse(opts.run);
      // An unparseable --run must not fall through to "the most recent heal":
      // that would unheal a different heal than the operator named.
      if (!n.success) { console.error('--run must be a positive run id.'); return 2; }
      runId = n.data;
    }

    // reopenBlast is left at its default here. Feature C exports the real one
    // and wave 2 passes it; until then the result says `reopened: false` and
    // carries the window, rather than claiming a re-open that did not happen.
    const result = await unheal({ targetId, field, runId });
    out(result);
    return result.unhealed ? 0 : 1;
  }));

export const COMMANDS = [brakeCommand, unhealCommand];
export default COMMANDS;
