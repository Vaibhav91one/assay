// Mint a consumer API key. The plaintext is printed once and never stored.
//
//   node tools/apikey.js "warehouse etl" --read mattel,ikea
//   node tools/apikey.js "operator" --write mattel
//
// Omitting the scope flag deliberately mints a legacy unscoped key.

import { createKey, type KeyScope } from '../src/api/keys.js';
import { causeChain, closeDb, DATABASE_URL, sqlState } from '../src/store/index.js';

const args = process.argv.slice(2);
const flags = args.flatMap((arg, index) => ['--read', '--write'].includes(arg) ? [index] : []);
if (flags.length > 1) {
  console.error('choose one scope: --read or --write');
  process.exit(1);
}

let scope: KeyScope | null = null;
if (flags.length === 1) {
  const index = flags[0]!;
  const access = args[index]!.slice(2) as KeyScope['access'];
  const targets = (args[index + 1] ?? '').split(',').map((target) => target.trim()).filter(Boolean);
  if (!targets.length) {
    console.error(`${args[index]} requires a comma-separated target list`);
    process.exit(1);
  }
  scope = { access, targets };
  args.splice(index, 2);
}

const name = args.join(' ').trim();
if (!name) {
  console.error('usage: npm run apikey -- "<name>" [--read|--write target[,target]]');
  process.exit(1);
}

// Host and database, never the credentials -- this line ends up in logs.
const where = DATABASE_URL.replace(/\/\/[^@/]*@/, '//');

try {
  const k = await createKey(name, scope);
  console.log(`\n  ${k.key}\n`);
  console.log(`  name    ${name}`);
  console.log(`  prefix  ${k.keyPrefix}`);
  console.log(`  scope   ${scope ? `${scope.access} ${scope.targets.join(',')}` : 'legacy (unscoped)'}`);
  console.log('\nStored hashed. This is the only time the key is shown.\n');
} catch (e) {
  // Uncaught, this printed a raw DrizzleQueryError -- the whole INSERT, its
  // parameters, and no sentence saying what to do -- and then hung, because the
  // pool was never closed and an open pg client keeps the process alive. Both
  // halves of that are fixed here: a reason, and a `finally`.
  const code = sqlState(e);
  // The INNERMOST message, first line only. Drizzle's wrapper says "Failed
  // query: insert into api_keys ..." and the sentence an operator can act on --
  // `column "scope" does not exist` -- is one `cause` below it, the same shape
  // `tools/migrate.ts` digs through.
  const why = (causeChain(e).at(-1) ?? (e as Error)).message.split('\n')[0];
  console.error(`\napikey FAILED  ${where}\n\n  ${why}\n`);
  /* copy(G) */
  if (code === '42703' || code === '42P01') {
    console.error(
      '  This database is older than the code -- the api_keys table is missing a\n' +
        '  column (or itself). Apply the migrations file by file, because\n' +
        '  `npm run db:migrate` refuses a database built by `drizzle-kit push`:\n\n' +
        '      for f in src/store/migrations/*.sql; do psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$f"; done\n',
    );
  }
  process.exitCode = 1;
} finally {
  await closeDb().catch(() => {});
}
