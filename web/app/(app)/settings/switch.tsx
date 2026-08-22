'use client';

import { useId } from 'react';
import { Switch } from '@base-ui/react/switch';

/**
 * One setting, and the truth about whether it is a setting.
 *
 * The `reason` prop is the point of this component. A switch that moves but
 * changes nothing is the single most damaging thing this screen could carry --
 * the product's whole claim is that it reports its own state rather than a
 * flattering version of it, and a decorative control is that claim failing in
 * the one place a person goes to check it.
 *
 * So there is no plain disabled state. A row is either operable, or it carries
 * a sentence saying what is missing and what would fix it; `reason` is what
 * makes it the second, and it renders where the eye already is rather than in a
 * tooltip nobody opens. `checked` stays honest either way: an unavailable row
 * still shows the position the instance is actually in, because "you cannot
 * change this here" and "this is off" are different facts and a greyed switch
 * stuck at off would state the wrong one.
 *
 * Base UI, matching `filter-menu.tsx` and `notifications.tsx`, not the Radix
 * half of `components/ui`. It brings `role="switch"`, `aria-checked` and
 * `aria-readonly` with it; what is added here is the label wiring and the
 * reason.
 */
export function SettingRow({
  label,
  detail,
  checked,
  reason,
  pending = false,
  onChange,
}: {
  label: string;
  /** What the setting does, in one line. Always shown. */
  detail: string;
  checked: boolean;
  /**
   * Why this cannot be changed here, or null when it can. Naming the variable
   * or the missing piece, not "unavailable" -- an operator reading this should
   * know which line of which file to go and write.
   */
  reason?: string | null;
  pending?: boolean;
  onChange?: (next: boolean) => void;
}) {
  const id = useId();
  const unavailable = Boolean(reason);

  return (
    <div className="flex w-full items-start gap-[24px] border-t border-[var(--border-hairline)] py-[14px]">
      <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
        <span id={`${id}-label`} className="body-13_5 text-[var(--text-primary)]">
          {label}
        </span>
        <span id={`${id}-detail`} className="caption-12 text-[var(--text-muted)]">
          {detail}
        </span>
        {reason && (
          // Not role="alert": this is the row's standing condition, true before
          // anyone arrived. An alert announces it as though it had just
          // happened, on every render, to every row that has one. It reaches a
          // screen reader through aria-describedby instead, once.
          <span id={`${id}-reason`} className="caption-12 mt-[2px] text-[var(--text-secondary)]">
            {reason}
          </span>
        )}
      </span>

      <Switch.Root
        checked={checked}
        disabled={unavailable || pending}
        onCheckedChange={onChange}
        aria-labelledby={`${id}-label`}
        aria-describedby={reason ? `${id}-detail ${id}-reason` : `${id}-detail`}
        className={`relative mt-[2px] h-[24px] w-[44px] shrink-0 rounded-full border transition-colors duration-[var(--duration-tint)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--semantic-link)] ${
          checked
            ? 'border-[var(--accent-brand)] bg-[var(--accent-brand)]'
            : 'border-[var(--border-default)] bg-[var(--surface-subtle)]'
        } ${unavailable ? 'cursor-not-allowed opacity-45' : 'cursor-pointer'} ${
          pending ? 'opacity-60' : ''
        }`}
      >
        <Switch.Thumb
          className={`absolute left-0 top-[2px] block size-[18px] rounded-full bg-[var(--surface-card)] shadow-elevation-control transition-transform duration-[var(--duration-pop)] ease-[var(--ease-pop)] ${
            checked ? 'translate-x-[22px]' : 'translate-x-[2px]'
          }`}
        />
      </Switch.Root>
    </div>
  );
}
