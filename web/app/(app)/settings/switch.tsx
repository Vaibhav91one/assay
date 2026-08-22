'use client';

import { useId, useState } from 'react';
import { Switch } from '@base-ui/react/switch';
import { Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

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
 * makes it the second.
 *
 * WHAT MOVED INTO THE TOOLTIP, AND WHAT DID NOT. The rows read dense -- title,
 * description, and on the unavailable ones a second sentence naming variables
 * -- so `detail` is now behind the info icon beside the title. `reason` is NOT,
 * and the split is not arbitrary: `detail` says what a setting does, which you
 * can ask for when you want it, while `reason` says why the control next to it
 * will not move, which you need at the moment you have already tried. Hiding
 * that one behind a hover puts the answer furthest from the person most likely
 * to want it. So the row is title + icon wherever there is nothing wrong, and
 * grows exactly one line where something is.
 *
 * `checked` stays honest either way: an unavailable row still shows the
 * position the instance is actually in, because "you cannot change this here"
 * and "this is off" are different facts and a greyed switch stuck at off would
 * state the wrong one.
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
  /** What the setting does, in one line. Behind the info icon beside the title. */
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
  // Controlled only so a tap can open it. Base UI's tooltip opens on hover
  // (mouse only) and on focus-visible; neither fires for a finger, and the
  // whole point of moving text behind an icon is that the text stays
  // reachable. `onClick` is the third way in, and Base UI still owns the other
  // two -- and the escape key and an outside press -- through `onOpenChange`.
  const [openDetail, setOpenDetail] = useState(false);

  return (
    <div className="flex w-full items-start gap-[24px] border-t border-[var(--border-hairline)] py-[14px]">
      <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
        <span className="flex items-center gap-[7px]">
          <span id={`${id}-label`} className="body-13_5 text-[var(--text-primary)]">
            {label}
          </span>
          <Tooltip open={openDetail} onOpenChange={setOpenDetail}>
            <TooltipTrigger
              // A real button, so it is in the tab order and answers Enter and
              // Space. `aria-describedby` points at the copy below rather than
              // at the popup, because the popup only exists while it is open:
              // a screen reader reaching this icon hears what the setting does
              // whether or not the tooltip has been asked to appear.
              aria-label={`About ${label}`}
              aria-describedby={`${id}-detail`}
              onClick={() => setOpenDetail((v) => !v)}
              // A tooltip a finger can open and cannot close is worse than one
              // it cannot open. Base UI dismisses on Escape and on the pointer
              // leaving, neither of which a touch user has; tapping the icon
              // again is the toggle above, and tapping anything else moves
              // focus off the button, which is this.
              onBlur={() => setOpenDetail(false)}
              // `focus-ring` rather than a focus-visible: utility of its own.
              // docs/MOTION.md moved the ring into one declaration precisely so
              // the things that are not `Button` still wear the same one.
              className="focus-ring flex size-[18px] shrink-0 cursor-pointer items-center justify-center rounded-full text-[var(--text-muted)] transition-colors duration-[var(--duration-tint)] hover:text-[var(--text-primary)]"
            >
              <Info size={14} strokeWidth={1.5} aria-hidden />
            </TooltipTrigger>
            <TooltipContent className="max-w-[320px]">{detail}</TooltipContent>
          </Tooltip>
        </span>
        <span id={`${id}-detail`} className="sr-only">
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
