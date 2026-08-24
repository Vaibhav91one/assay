// `assay connectors` -- configure where Assay speaks, and prove it can.
//
// Exports a commander command for `bin/assay.ts` to register (feature I owns
// that file), and runs directly under tsx so it is usable before the binary
// exists:
//
//   npx tsx tools/cli/connectors.ts list
//   npx tsx tools/cli/connectors.ts set discord --url https://discord.com/api/webhooks/...
//   npx tsx tools/cli/connectors.ts set brightdata            # mints the secret
//   npx tsx tools/cli/connectors.ts test
//   npx tsx tools/cli/connectors.ts forget discord
//
// `set brightdata` prints the minted secret ONCE, the way `tools/apikey.ts`
// prints an API key: it has to be pasted into Bright Data's webhook config, and
// after that there is no way to read it back out of Assay.

import { Command } from 'commander';
import { randomBytes } from 'node:crypto';
import { KINDS, describe, put, remove, type Kind } from '../../src/connectors/config.js';
import { announce, summarise, testMessage } from '../../src/connectors/deliver.js';

const line = (s: string): void => console.log(s);

export const command = new Command('connectors')
  .description('Bright Data delivery and Discord.');

command
  .command('list', { isDefault: true })
  .description('Which connectors are configured. Never what they are configured with.')
  .action(async () => {
    for (const p of await describe()) {
      // The token half first, and only for a kind that has one. Bright Data's
      // two mechanisms point in opposite directions and printing only the
      // delivery one said "not configured" at operators who were using it.
      if (p.token) {
        line(
          `  ${`${p.kind} token`.padEnd(24)} ${p.token.set ? 'set' : 'not set'}` +
            `  (${p.token.var}; lets Assay call ${p.kind})`,
        );
      }
      line(
        `  ${(p.token ? `${p.kind} delivery` : p.kind).padEnd(24)}` +
          ` ${p.configured ? 'configured' : 'not configured'}` +
          (p.updated_at ? `  (${p.updated_at})` : ''),
      );
    }
  });

command
  .command('set <kind>')
  .description('Configure one connector. brightdata mints a secret; discord takes --url.')
  .option('--url <url>', 'the incoming-webhook URL (discord)')
  .action(async (kind: string, opts: { url?: string }) => {
    if (!(KINDS as readonly string[]).includes(kind)) {
      throw new Error(`kind must be one of: ${KINDS.join(', ')}`);
    }

    if (kind === 'brightdata') {
      const secret = `bdw_${randomBytes(24).toString('hex')}`;
      await put('brightdata', { secret });
      line('\n  Bright Data delivery secret, shown once and never again:\n');
      line(`    ${secret}\n`);
      line('  Set it on the job as the webhook Authorization header:');
      line(`    auth_header=Bearer ${secret}`);
      line('  (or webhook_header_Authorization on the per-scraper trigger)\n');
      line('  Assay refuses any delivery that does not carry it.\n');
      return;
    }

    if (!opts.url) throw new Error(`--url is required for ${kind}`);
    const p = await put(kind as Kind, { url: opts.url });
    line(`  ${p.kind} configured.`);
  });

command
  .command('forget <kind>')
  .description('Remove one connector.')
  .action(async (kind: string) => {
    if (!(KINDS as readonly string[]).includes(kind)) {
      throw new Error(`kind must be one of: ${KINDS.join(', ')}`);
    }
    await remove(kind as Kind);
    line(`  ${kind} forgotten.`);
  });

command
  .command('test')
  .description('Send one message to every configured chat connector and report what happened.')
  .action(async () => {
    const results = await announce(testMessage());
    line(`  ${summarise(results)}`);
    // Exit non-zero on a delivery failure. A test command that exits 0 while
    // the endpoint is dead is how a broken alert path stays broken.
    if (results.some((r) => !r.ok)) process.exitCode = 1;
  });

export default command;

if (import.meta.url === `file://${process.argv[1]}`) {
  command.parseAsync(process.argv.slice(2), { from: 'user' }).catch((e: Error) => {
    console.error(`error: ${e.message}`);
    process.exit(2);
  });
}
