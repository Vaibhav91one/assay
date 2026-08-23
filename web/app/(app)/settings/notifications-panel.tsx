'use client';

import { useState, useTransition } from 'react';
import { SettingRow } from './switch';
import { setDigest } from './actions';
import type { AlertsView } from '@/lib/alerts';
import { t } from '@/lib/copy';

/**
 * Where both environment rows send you.
 *
 * Deliberately NOT in `settings/docs.ts`. That file is the map from a
 * connector KIND to its heading and is asserted as such by
 * `test/settings-docs.test.ts`; mail is not a connector kind, and widening
 * that map to hold one would make the test's "every kind has an href" claim
 * mean less. One heading covers both rows because one heading documents both
 * -- credentials.mdx's "Email delivery" carries ASSAY_WEBHOOK_URL too.
 */
const MAIL_DOC = '/docs/credentials#email-delivery';

/**
 * What Assay will send you, and which parts of it you can change from here.
 *
 * Three rows, and only one of them is a control -- the other two are not
 * drawn as controls at all, because they are not. That ratio is the honest one:
 * the break alert is decided per run from the process environment and reads
 * nothing from the store, so there is no bit on this screen to flip, while the
 * digest has a table, a due query and a worker already wired to each other and
 * has simply never had a row. Drawing five more switches over settings nothing
 * reads would cost nothing to build and would break the only promise this
 * product makes.
 *
 * A row is a title and an info icon. What each setting does sits behind the
 * icon; what makes a row unavailable does not, and `switch.tsx` says why. The
 * two sentences under "Break alerts by email" and "Webhook fallback" are the
 * only writing on this screen that answers a question somebody is asking at
 * the moment they read it -- they have just found a switch that will not move
 * -- and an answer you have to go looking for is an answer half of them will
 * not find.
 *
 * The things an alerting screen usually offers next -- a cooldown between
 * repeat alerts, per-target subscriptions, routing to an owner, retries, a
 * delivery log -- have no column, no code and no consumer here. They are named
 * in the note at the bottom rather than drawn, because a person deciding
 * whether to trust this instance is better served by the list of what it
 * cannot do than by a switch that pretends it can.
 */
export function NotificationsPanel({ view }: { view: AlertsView }) {
  const [enabled, setEnabled] = useState(view.digest.enabled);
  const [failure, setFailure] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const toggle = (next: boolean) => {
    // Optimistic, then corrected by what the row actually says. The correction
    // is not a formality: `setDigest` re-reads the store after writing, so a
    // write that did not land comes back disagreeing and the switch moves back
    // rather than sitting on a state the server never accepted.
    setEnabled(next);
    setFailure(null);
    start(async () => {
      const r = await setDigest(next);
      if (r.ok) setEnabled(r.enabled);
      else {
        setEnabled(!next);
        setFailure(r.detail);
      }
    });
  };

  const { mail, webhookConfigured, digest } = view;

  return (
    <div className="w-full">
      <SettingRow
        label="Weekly digest"
        detail={
          digest.lastSentAt
            ? `One report per week: what changed, and what was withheld. Last sent ${digest.lastSentAt.toISOString().slice(0, 10)}.`
            : 'One report per week: what changed, and what was withheld. Never sent yet.'
        }
        checked={enabled}
        pending={pending}
        // The only precondition worth stating is the one that would make the
        // report fail to send. Offering the switch and then silently producing
        // nothing every week is the failure mode this screen exists to avoid.
        reason={
          mail.ready
            ? null
            : `Assay cannot send mail: ${mail.missing} is not set in this process's environment.`
        }
        onChange={toggle}
      />
      {failure && (
        <p role="alert" className="caption-12 pb-[6px] text-[var(--semantic-danger)]">
          Not saved — {failure}. The switch has been put back where it was.
        </p>
      )}

      {/* Not switches. Both of these are decided per run from the process
          environment and read nothing from the store, so neither is a bit
          anything on this screen could flip -- and a switch that will not move
          still asks to be pressed. They report a word and say where the word
          is set instead -- the same pair the Connections tab and the sign-in
          key panel use, because all three answer "is this credential present".
          This row said "sending", which was a third vocabulary. */}
      <SettingRow
        label="Break alerts by email"
        detail="When a field breaks, one alert per episode — not one per page."
        checked={mail.ready}
        value={mail.ready ? t('common.configured') : t('common.notConfigured')}
        doc={MAIL_DOC}
        reason={`Set in .env, not here: the worker reads ASSAY_RESEND_KEY, ASSAY_MAIL_FROM and ASSAY_MAIL_TO on each run and nothing from the store.${
          mail.ready ? '' : ` ${mail.missing} is not set, so a break alert would fall through to the webhook.`
        }`}
      />

      <SettingRow
        label="Webhook fallback"
        detail="Where a break alert goes when the email fails. The outcome is recorded on the episode either way."
        checked={webhookConfigured}
        value={webhookConfigured ? t('common.configured') : t('common.notConfigured')}
        doc={MAIL_DOC}
        reason={`Set in .env, not here: ASSAY_WEBHOOK_URL.${
          webhookConfigured ? '' : ' Unset, so a failed email is recorded as undelivered and nothing else is tried.'
        }`}
      />

      {/* A design note explaining which switches were not built and why, on
          the screen itself. It is a good note and it is addressed to a reader
          of the repository, not to an operator deciding whether to turn the
          digest on -- docs/APP-DESIGN.md 5b P5, the pattern the 34-frame audit
          found on twelve frames. It also printed its own backticks around
          `episodes.notified`, and called this surface "Activity" while the tab
          above it says Notifications.

          Removed rather than reworded: the three rows above already state what
          each setting does and what is environment rather than store. Nothing
          on this screen now claims a capability it does not have. */}
    </div>
  );
}
