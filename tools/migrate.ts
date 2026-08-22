// Apply the migrations, and say so when it does not work.
//
// WHY THIS EXISTS RATHER THAN `drizzle-kit migrate`. Against a database built by
// `drizzle-kit push` -- which creates the tables and writes no journal --
// `drizzle-kit migrate` replays `0000` against tables that already exist, and
// Postgres refuses. It then exits 1 having printed one spinner frame and
// nothing else:
//
//     [⣷] applying migrations...
//
// No error, no newline, no reason, and `--verbose` is not a flag it accepts.
// Two people lost time to a command that failed and looked like it had worked.
// A command that fails silently is worse than one that fails.
//
// `migrate()` is the same function drizzle-kit calls, from the same package
// this repository already depends on, against the same
// `drizzle.__drizzle_migrations` journal -- so the semantics are unchanged.
// The only difference is that an exception reaches the operator.

import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { closeDb, DATABASE_URL, getDb } from '../src/store/index.js';

const FOLDER = 'src/store/migrations';

/** Host and database, never the credentials -- this line ends up in logs. */
const where = DATABASE_URL.replace(/\/\/[^@/]*@/, '//');

try {
  await migrate(getDb(), { migrationsFolder: FOLDER });
  console.log(`migrations applied  ${where}`);
} catch (e) {
  // Drizzle wraps the driver error, and the wrapper says "Failed query: CREATE
  // TABLE ..." while the sentence an operator needs -- `relation "captures"
  // already exists` -- is one `cause` deeper. Both are printed, cause first.
  const chain: string[] = [];
  for (let err: unknown = e; err instanceof Error; err = err.cause) chain.push(err.message);
  const message = chain.reverse().join('\n\n  ');
  console.error(`\nmigrate FAILED  ${where}\n\n  ${message}\n`);
  // The one failure that looks like a mystery and is not.
  if (/already exists/i.test(message)) {
    console.error(
      '  This database already has the tables, and the migration journal\n' +
        '  (drizzle.__drizzle_migrations) does not know it -- which is what\n' +
        '  `drizzle-kit push` leaves behind. Migrate cannot reconcile that for\n' +
        '  you. Either point DATABASE_URL at a database built by migrate:\n\n' +
        '      createdb assay && DATABASE_URL=postgres://localhost:5432/assay npm run db:migrate\n\n' +
        '  or drop and rebuild this one. `push` is for throwaway databases; the\n' +
        '  migrations are the checked-in history.\n',
    );
  }
  process.exitCode = 1;
} finally {
  await closeDb().catch(() => {});
}
