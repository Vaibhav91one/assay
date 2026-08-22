'use client';

import { useState, useTransition } from 'react';
import { SettingRow } from './switch';
import { setDigest } from './actions';
import type { AlertsView } from '@/lib/alerts';

/**
 * What Assay will send you, and which parts of it you can change from here.
 *
 * Three rows, and only one of them is a control. That ratio is the honest one:
 * the break alert is decided per run from the process environment and reads
 * nothing from the store, so there is no bit on this screen to flip, while the
 * digest has a table, a due query and a worker already wired to each other and
 * has simply never had a row. Drawing five more switches over settings nothing
 * reads would cost nothing to build and would break the only promise this
 * product makes.
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

      <SettingRow
        label="Break alerts by email"
        detail="When a field breaks, one alert per episode — not one per page."
        checked={mail.ready}
        reason={`Environment, not a setting: the worker reads ASSAY_RESEND_KEY, ASSAY_MAIL_FROM and ASSAY_MAIL_TO on each run and nothing from the store.${
          mail.ready ? '' : ` ${mail.missing} is not set, so a break alert would fall through to the webhook.`
        }`}
      />

      <SettingRow
        label="Webhook fallback"
        detail="Where a break alert goes when the email fails. The outcome is recorded on the episode either way."
        checked={webhookConfigured}
        reason={`Environment, not a setting: ASSAY_WEBHOOK_URL.${
          webhookConfigured ? '' : ' Unset, so a failed email is recorded as undelivered and nothing else is tried.'
        }`}
      />

      <p className="caption-12 mt-[24px] rounded-[var(--radius-control)] border border-[var(--border-hairline)] bg-[var(--surface-subtle)] px-[14px] py-[12px] text-[var(--text-secondary)]">
        Not offered here because nothing behind this screen would read it: a cooldown between
        repeat alerts, subscriptions per target or field, routing to an owner, retrying a failed
        send, and a delivery log. Each one needs a column and a consumer before it can be a
        switch. Until then the record of a send is `episodes.notified`, and a failed one appears
        in Activity as its own item rather than a line in a log nobody opens.
      </p>
    </div>
  );
}
