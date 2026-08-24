'use client';

import { Popover } from '@base-ui/react/popover';
import { ChevronsUpDown } from 'lucide-react';
import { t } from '@/lib/copy';

/**
 * Figma `settings · sidebar · user menu` (457:5452), hosted only.
 *
 * `sidebar.tsx` removed this chevron deliberately for self-host, on the
 * grounds that a menu with nothing behind it is an affordance for a control
 * that cannot exist. That reasoning does not apply here: `AUTH_MODE=clerk`
 * means there IS a session, and Docs/GitHub/Sign out are three real
 * destinations. This renders only when the caller already knows that --
 * `sidebar.tsx` passes it the same `named` flag that already gates the
 * initials-vs-Server-icon avatar, so the two never disagree about which mode
 * they're in.
 */
export function UserMenu() {
  return (
    <Popover.Root>
      <Popover.Trigger
        aria-label={t('nav.userMenu.trigger')}
        className="focus-ring press-row shrink-0 rounded-[var(--radius-control)] p-[4px] text-[#8a8d93] transition-colors duration-[var(--duration-tint)] hover:bg-[#292a2e] hover:text-[var(--text-inverse)]"
      >
        <ChevronsUpDown size={14} strokeWidth={1.5} aria-hidden />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={8} align="end" className="z-50">
          <Popover.Popup className="motion-popup w-[200px] overflow-hidden rounded-[var(--radius-card)] bg-[var(--surface-card)] p-[4px] shadow-elevation-floating">
            <a
              href="/docs"
              className="focus-ring press-row block rounded-[var(--radius-control)] px-[10px] py-[7px] meta-13 text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)] hover:text-[var(--text-primary)]"
            >
              {t('nav.docs')}
            </a>
            <a
              href="https://github.com/Vaibhav91one/assay"
              target="_blank"
              rel="noreferrer"
              className="focus-ring press-row block rounded-[var(--radius-control)] px-[10px] py-[7px] meta-13 text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)] hover:text-[var(--text-primary)]"
            >
              {t('nav.userMenu.github')}
            </a>
            <form action="/sign-out" method="post">
              <button
                type="submit"
                className="focus-ring press-row block w-full rounded-[var(--radius-control)] px-[10px] py-[7px] text-left meta-13 text-[var(--semantic-danger)] hover:bg-[var(--surface-subtle)]"
              >
                {t('nav.userMenu.signOut')}
              </button>
            </form>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
