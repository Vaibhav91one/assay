// The notifications tab is allowed to draw exactly one switch, and this is why.
//
// Two claims are under test. The first is that the sentence the screen prints
// about mail matches the guards `send()` actually runs, in the same order --
// telling someone ASSAY_MAIL_TO is missing while ASSAY_RESEND_KEY is also
// missing sends them to fix the wrong line. The second is the one that decides
// whether the switch is a lie: that turning it on changes what `dueDigests()`
// hands the worker, and turning it off changes it back.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getDb, closeDb, sql } from '../src/store/index.js';
import { dueDigests } from '../src/reports/digest.js';
import { send } from '../src/notify.js';
import {
  alertsView,
  mailPresence,
  setDigestEnabled,
  DIGEST_CADENCE,
} from '../web/lib/alerts.js';

describe('what the notifications tab may claim', () => {
  describe('mail presence', () => {
    // No database, no network: this is the wording contract on its own.
    const env = (o: Record<string, string>) => o as unknown as NodeJS.ProcessEnv;

    it('names the first thing missing, in the order send() checks', () => {
      expect(mailPresence(null, env({})).missing).toBe('ASSAY_RESEND_KEY');
      expect(mailPresence(null, env({ ASSAY_RESEND_KEY: 'k' })).missing).toBe('ASSAY_MAIL_FROM');
      expect(
        mailPresence(null, env({ ASSAY_RESEND_KEY: 'k', ASSAY_MAIL_FROM: 'a@b.c' })).missing,
      ).toBe('ASSAY_MAIL_TO');
    });

    it('agrees with send(), which is the thing that would actually refuse', async () => {
      // The screen's order is only worth anything if it is the sender's order.
      // Reading the message back off the real guard is what keeps the two from
      // drifting apart the next time one of them is edited.
      const refusal = async (e: Record<string, string>) => {
        try {
          await send({
            to: e.ASSAY_MAIL_TO,
            subject: 's',
            html: 'h',
            apiKey: e.ASSAY_RESEND_KEY,
            from: e.ASSAY_MAIL_FROM,
          });
          return null;
        } catch (err) {
          return (err as Error).message;
        }
      };
      expect(await refusal({})).toBe('ASSAY_RESEND_KEY is not set');
      expect(await refusal({ ASSAY_RESEND_KEY: 'k' })).toBe('ASSAY_MAIL_FROM is not set');
      expect(await refusal({ ASSAY_RESEND_KEY: 'k', ASSAY_MAIL_FROM: 'a@b.c' })).toBe(
        'no recipient',
      );
    });

    it('counts a row recipient as an address, since the worker does', () => {
      const set = env({ ASSAY_RESEND_KEY: 'k', ASSAY_MAIL_FROM: 'a@b.c' });
      // `sendDueDigests` sends to `d.recipients ?? ASSAY_MAIL_TO`, so a row with
      // its own recipients needs no environment address.
      expect(mailPresence(['ops@example.com'], set).ready).toBe(true);
      expect(mailPresence([], set).ready).toBe(false);
    });
  });

  describe('the digest switch', () => {
    let dbUp = false;
    // Whether this test created the install's digest row, and so whether it is
    // this test's to remove afterwards.
    let created = false;
    let priorNextRunAt: Date | string | null = null;

    const firstRow = async () => {
      const { rows } = await getDb().execute(
        sql`SELECT digest_id, next_run_at FROM digests ORDER BY digest_id LIMIT 1`,
      );
      return rows[0] as { digest_id: number; next_run_at: Date | string | null } | undefined;
    };

    beforeAll(async () => {
      try {
        const existing = await firstRow();
        created = existing === undefined;
        priorNextRunAt = existing?.next_run_at ?? null;
        dbUp = true;
      } catch {
        dbUp = false;
      }
    });

    afterAll(async () => {
      if (!dbUp) return;
      const row = await firstRow();
      if (row) {
        if (created) await getDb().execute(sql`DELETE FROM digests WHERE digest_id = ${row.digest_id}`);
        else
          await getDb().execute(
            sql`UPDATE digests SET next_run_at = ${priorNextRunAt} WHERE digest_id = ${row.digest_id}`,
          );
      }
      await closeDb().catch(() => {});
    });

    it('postgres is reachable (required when ASSAY_REQUIRE_DB is set)', () => {
      if (process.env.ASSAY_REQUIRE_DB) expect(dbUp).toBe(true);
    });

    it('on makes the worker see a digest, off makes it stop seeing one', async () => {
      if (!dbUp) return;
      const d = getDb();

      await setDigestEnabled(true);
      const on = await alertsView();
      expect(on.digest.enabled).toBe(true);
      expect(on.digest.cadence).toBe(DIGEST_CADENCE);

      const row = (await firstRow())!;
      // Enabling schedules the first report one cadence out rather than now, so
      // switching it on never fires a report over a window nobody asked for.
      expect(row.next_run_at).not.toBeNull();
      expect(new Date(row.next_run_at!).getTime()).toBeGreaterThan(Date.now());

      // The switch is only real if it moves the field the due query selects on,
      // so the proof is `dueDigests` -- the function the worker calls -- and not
      // a re-read of the column this test just wrote.
      //
      // ponytail: scoped by digest_id because reports.test.ts owns a digest row
      // of its own and the two files can run at once. Per-file schemas if the
      // suite ever grows a third writer here.
      const mine = <T extends { digestId: number }>(xs: T[]) =>
        xs.filter((x) => x.digestId === row.digest_id);

      await d.execute(
        sql`UPDATE digests SET next_run_at = now() - interval '1 minute' WHERE digest_id = ${row.digest_id}`,
      );
      expect(mine(await dueDigests())).toHaveLength(1);

      await setDigestEnabled(false);
      expect((await alertsView()).digest.enabled).toBe(false);
      // Parked, not deleted: `last_sent_at` survives so a later re-enable does
      // not re-send a period that already went out.
      expect((await firstRow())!.next_run_at).toBeNull();
      expect(mine(await dueDigests())).toEqual([]);
    });
  });
});
