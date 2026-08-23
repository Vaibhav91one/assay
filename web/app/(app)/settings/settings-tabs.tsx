'use client';

import { useEffect, useState } from 'react';
import { Tabs } from '@base-ui/react/tabs';
import { Bell, HardDrive, Plug, ShieldCheck } from 'lucide-react';
import { SECTION_TAB, TABS, type TabId } from './tabs';
import { t } from '@/lib/copy';

/**
 * Settings, in four groups this product already had names for.
 *
 * The groups are not invented. APP-DESIGN 7.1 ruled on exactly this screen --
 * "Output, notification and connections are legitimately UI. Thresholds are
 * not" -- and three of these tabs are those three words. The fourth, Publishing,
 * is where the thresholds went once they stopped being controls: it shows what
 * Assay may write and under which per-field policy, as provenance, with the
 * export-as-YAML escape hatch that 7.1 asked for. Nothing on it is settable,
 * which is the finding, not an omission.
 *
 * Base UI, matching `filter-menu.tsx` and `notifications.tsx`. It brings
 * `role="tablist"`/`"tab"`/`"tabpanel"`, `aria-selected` and arrow-key roving
 * focus with it, which is the entire reason not to hand-roll this.
 */
const ICON: Record<TabId, typeof Bell> = {
  publishing: ShieldCheck,
  output: HardDrive,
  notifications: Bell,
  connections: Plug,
};

export function SettingsTabs({
  panels,
  initial,
}: {
  panels: Record<TabId, React.ReactNode>;
  initial: TabId;
}) {
  const [value, setValue] = useState<TabId>(initial);

  useEffect(() => {
    const from = SECTION_TAB[window.location.hash.slice(1)];
    if (from) setValue(from);
  }, []);

  const select = (next: TabId) => {
    setValue(next);
    // `replaceState`, not the router: the panels are already in the tree and a
    // navigation would re-render the whole settings subtree to change which one
    // is visible. This keeps the tab shareable and the back button honest
    // without paying for a round trip to say so.
    const url = new URL(window.location.href);
    url.searchParams.set('tab', next);
    url.hash = '';
    window.history.replaceState(null, '', url);
  };

  return (
    <Tabs.Root
      value={value}
      onValueChange={(v) => select(v as TabId)}
      className="w-full"
    >
      <Tabs.List className="relative flex items-center gap-[4px]" aria-label={t('settings.tabs.label')}>
        {/* One highlight that travels, rather than each tab lighting its own --
            MOTION.md's rule for a moving selection. Base UI measures the active
            tab into these two custom properties; the transition is what makes
            it read as the same object moving. */}
        <Tabs.Indicator
          renderBeforeHydration
          className="absolute left-0 top-0 z-0 h-full rounded-[var(--radius-control)] bg-[var(--surface-subtle)]"
          style={{
            left: 'var(--active-tab-left)',
            width: 'var(--active-tab-width)',
            transitionProperty: 'left, width',
            transitionDuration: 'var(--duration-glide)',
            transitionTimingFunction: 'var(--ease-glide)',
          }}
        />
        {TABS.map(({ id, label }) => {
          const Icon = ICON[id];
          return (
          <Tabs.Tab
            key={id}
            value={id}
            className={`press-row relative z-10 flex shrink-0 cursor-pointer items-center gap-[6px] rounded-[var(--radius-control)] px-[14px] py-[8px] transition-colors duration-[var(--duration-tint)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--semantic-link)] ${
              value === id
                ? 'text-[var(--text-primary)]'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Icon size={14} strokeWidth={1.5} aria-hidden />
            {/* Selection is colour and the travelling fill, never weight:
                Questrial ships one weight, so a bolder tab is not available and
                faking it would be a second typeface. */}
            <span className="meta-12_5">{label}</span>
          </Tabs.Tab>
          );
        })}
      </Tabs.List>

      {TABS.map(({ id }) => (
        <Tabs.Panel key={id} value={id} className="motion-fade-up w-full pt-[28px]">
          {panels[id]}
        </Tabs.Panel>
      ))}
    </Tabs.Root>
  );
}
