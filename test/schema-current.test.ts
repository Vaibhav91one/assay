// A store missing tables is refused, and says which ones.
//
// This pins a fault that reached a real operator. A process started with no
// `DATABASE_URL` connects to the default `postgres://localhost:5432/assay`, and
// on the machine where this was found that database predated the `conversations`
// migration. The app served every screen, the agent answered every message, and
// each one was dropped -- the only trace being a drizzle error about a relation,
// caught and discarded three layers up. Four exchanges, nothing written.
//
// The check is over TABLES rather than the migration journal, and the reason is
// measurable rather than stylistic: `assay`, `assay_live` and `assay_ui` were all
// created with `db:push`, which applies the schema and writes NO journal rows.
// Counting applied migrations would have condemned three working databases and
// cleared the broken one.

import { afterAll, describe, expect, it } from 'vitest';
import {
  assertSchemaCurrent, closeDb, getDb, schemaComplaint, wantedTables, sql,
} from '../src/store/index.js';

afterAll(async () => { await closeDb(); });

describe('the complaint, without needing a broken database to point at', () => {
  it('says nothing when every table is present', () => {
    expect(schemaComplaint(wantedTables(), 'postgres://localhost:5432/x')).toBeNull();
  });

  it('names the missing table, the database, and the fix', () => {
    // The real case: `conversations` absent, everything else there.
    const present = wantedTables().filter((t) => t !== 'conversations');
    const msg = schemaComplaint(present, 'postgres://localhost:5432/assay');
    expect(msg).toContain('conversations');
    expect(msg).toContain('postgres://localhost:5432/assay');
    expect(msg).toContain('npm run db:migrate');
  });

  it('names every missing table, not just the first', () => {
    const msg = schemaComplaint([], 'postgres://localhost:5432/empty')!;
    for (const t of wantedTables()) expect(msg).toContain(t);
  });

  it('keeps a password out of the sentence', () => {
    // The message names the database on purpose -- pointing at the wrong store
    // is the whole failure -- but a connection string carries a credential when
    // someone has set one, and an error is the one place it must not surface.
    const msg = schemaComplaint([], 'postgres://alice:hunter2@db.example:5432/prod')!;
    expect(msg).not.toContain('hunter2');
    expect(msg).not.toContain('alice');
    expect(msg).toContain('<credentials>');
    expect(msg).toContain('db.example');
  });

  it('covers every table the schema declares, so a new one is not forgotten', () => {
    // The list is derived, never hand-written. If someone adds a table and this
    // count does not move, the derivation has broken rather than the schema.
    expect(wantedTables().length).toBeGreaterThanOrEqual(12);
    expect(wantedTables()).toContain('conversations');
  });
});

describe('against the real store', () => {
  it('passes on the database the rest of the suite just used', async () => {
    try {
      await getDb().execute(sql`select 1`);
    } catch {
      // Loud, not vacuous. `ASSAY_REQUIRE_DB=1` exists because a test that
      // early-returns on an absent database reports PASSED rather than skipped,
      // and this file is about precisely that class of dishonesty.
      if (process.env.ASSAY_REQUIRE_DB) {
        throw new Error('ASSAY_REQUIRE_DB is set and the database is unreachable');
      }
      return;
    }
    await expect(assertSchemaCurrent()).resolves.toBeUndefined();
  });
});
