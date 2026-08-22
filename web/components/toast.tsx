'use client';

import { Check, CircleAlert } from 'lucide-react';

/**
 * The outcome of an async action, after the fact. Never a question, never an
 * error that blocks work -- those land inline, where the action started.
 *
 * It is a `role="status"` on purpose: a receipt announced politely. An
 * `alert` would interrupt a screen reader mid-sentence to say a thing already
 * happened.
 */
export function Toast({
  variant = 'default',
  message,
  action,
}: {
  variant?: 'default' | 'error';
  message: React.ReactNode;
  action?: React.ReactNode;
}) {
  const error = variant === 'error';
  const Icon = error ? CircleAlert : Check;

  return (
    <div
      role="status"
      className="fixed bottom-[24px] left-1/2 flex -translate-x-1/2 items-center gap-[16px] rounded-[var(--radius-control)] bg-[var(--bg-sidebar)] py-[12px] pl-[16px] pr-[12px] shadow-elevation-floating"
    >
      <Icon
        size={16}
        strokeWidth={1.5}
        className={error ? 'text-[var(--semantic-danger)]' : 'text-[var(--semantic-success)]'}
        aria-hidden
      />
      <span className="meta-13 text-[var(--text-inverse)]">{message}</span>
      {action}
    </div>
  );
}

/** The rail's own hover ink. The toast sits on `bg/sidebar`, not on the page. */
export const TOAST_BUTTON =
  'flex items-center gap-[6px] rounded-[6px] px-[10px] py-[4px] hover:bg-[#292a2e] disabled:opacity-60';
