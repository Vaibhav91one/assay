// Server-only. Opens a Postgres pool; see web/lib/queue.ts on why
// `server-only` is deliberately not a dependency.
import { getDb, sql } from 'assay/store';
import { nextRunAt } from 'assay/engine/schedule';

/**
 * What this install will actually send, and the one part of it a person may change.
 *
 * The whole screen has to be a fact about the running instance rather than a
 * preference we recorded and nothing reads, so each row here was checked against
 * the code that sends:
 *
 *   - The break alert is environment. `tools/worker.ts` decides per run from
 *     `ASSAY_MAIL_TO` / `ASSAY_WEBHOOK_URL` and reads nothing from the store, so
 *     there is no bit here to flip. It is reported, never offered.
 *   - The digest is the exception. `digests`, `dueDigests()` and the worker's
 *     `sendDueDigests()` are all real and already wired to each other; the only
 *     reason no digest has ever gone out is that nothing has ever inserted the
 *     row. That is a missing write path, not a missing feature, and it is the
 *     one control this screen is entitled to draw.
 *
 * Everything else an alerting screen usually offers -- a cooldown, per-target
 * subscriptions, owner routing, retries, a delivery log -- has nothing behind it
 * in this codebase, so it is not drawn at all.
 */

/**
 * The digest cadence, fixed.
 *
 * `cadenceMs` would take `hourly`, `daily` or `12h` just as happily, but a
 * period picker is a second control and the report is written as a period
 * summary. One row per install, one cadence, until someone asks for another.
 */
export const DIGEST_CADENCE = 'weekly';

export interface MailPresence {
  /** Whether `send()` would get past its own guards. */
  ready: boolean;
  /**
   * The first thing it would refuse for, spelled as the operator's shell spells
   * it, or null. Order matches `src/notify.ts` exactly -- reporting the second
   * missing variable while the first is also missing sends someone to fix the
   * wrong line.
   */
  missing: string | null;
}

export interface AlertsView {
  mail: MailPresence;
  /** The break alert's fallback path. Presence only, never the secret. */
  webhookConfigured: boolean;
  digest: {
    enabled: boolean;
    cadence: string;
    lastSentAt: Date | null;
  };
}

/**
 * Every precondition `send()` checks, in the order it checks them.
 *
 * Restated here rather than imported: `src/notify.ts` reaches the network, and
 * this runs in a request. The order is the contract, and `test/alerts.test.ts`
 * holds the two files to it.
 */
export function mailPresence(
  recipients: readonly string[] | null,
  env: NodeJS.ProcessEnv = process.env,
): MailPresence {
  const missing = !env.ASSAY_RESEND_KEY
    ? 'ASSAY_RESEND_KEY'
    : !env.ASSAY_MAIL_FROM
      ? 'ASSAY_MAIL_FROM'
      : !(recipients?.length || env.ASSAY_MAIL_TO)
        ? 'ASSAY_MAIL_TO'
        : null;
  return { ready: missing === null, missing };
}

interface DigestRow {
  digest_id: number;
  cadence: string;
  next_run_at: Date | string | null;
  last_sent_at: Date | string | null;
  recipients: unknown;
}

/**
 * The digest row, or the absence of one.
 *
 * `ORDER BY digest_id LIMIT 1` because the store is single-instance by
 * construction -- `src/store/schema.ts` opens by saying so -- and one install
 * gets one digest.
 */
const digestRow = async (): Promise<DigestRow | undefined> => {
  const { rows } = await getDb().execute(sql`
    SELECT digest_id, cadence, next_run_at, last_sent_at, recipients
    FROM digests ORDER BY digest_id LIMIT 1`);
  return rows[0] as unknown as DigestRow | undefined;
};

export async function alertsView(): Promise<AlertsView> {
  const row = await digestRow();
  const recipients = Array.isArray(row?.recipients) ? (row.recipients as string[]) : null;
  return {
    mail: mailPresence(recipients),
    webhookConfigured: Boolean(process.env.ASSAY_WEBHOOK_URL),
    digest: {
      // `next_run_at IS NOT NULL` is the same test `dueDigests()` runs, so the
      // switch reads the field the worker reads. Null is paused, exactly as it
      // is for a target -- pausing is a property of the data, not a flag beside
      // it.
      enabled: Boolean(row?.next_run_at),
      cadence: row?.cadence ?? DIGEST_CADENCE,
      lastSentAt: row?.last_sent_at ? new Date(row.last_sent_at) : null,
    },
  };
}

/**
 * Turn the digest on or off, by moving the field the due query selects on.
 *
 * On writes a `next_run_at` one cadence out, so enabling it never fires a report
 * immediately over a window nobody asked for. Off nulls it, which the due query
 * never selects again; the row is kept so `last_sent_at` survives and a later
 * re-enable does not re-send a period that already went out.
 *
 * Off with no row writes nothing. Absence is already off, and inserting a parked
 * row to record that would be storing a preference nothing reads.
 */
export async function setDigestEnabled(on: boolean): Promise<void> {
  const at = on ? nextRunAt(DIGEST_CADENCE) : null;
  await getDb().transaction(async (tx) => {
    // FOR UPDATE, so two people toggling at once cannot both find no row and
    // both insert one -- two rows would mean two digests every period.
    const { rows } = await tx.execute(sql`
      SELECT digest_id FROM digests ORDER BY digest_id LIMIT 1 FOR UPDATE`);
    const id = (rows[0] as { digest_id: number } | undefined)?.digest_id;
    if (id != null) {
      await tx.execute(sql`UPDATE digests SET next_run_at = ${at} WHERE digest_id = ${id}`);
    } else if (on) {
      await tx.execute(
        sql`INSERT INTO digests (cadence, next_run_at) VALUES (${DIGEST_CADENCE}, ${at})`,
      );
    }
  });
}
