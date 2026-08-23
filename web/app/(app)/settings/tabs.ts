import { t } from '@/lib/copy';

/**
 * Which tabs exist, and which one a URL is asking for.
 *
 * A plain module rather than part of `settings-tabs.tsx`, because the page
 * reads `?tab=` on the server to decide what to render first, and anything
 * exported from a `'use client'` file is a reference the server may only render
 * or pass along -- calling it throws at request time, not at build time, which
 * is a very quiet way to ship a broken screen.
 */
export const TABS = [
  { id: 'publishing', label: t('settings.tab.publishing') },
  { id: 'output', label: t('settings.tab.output') },
  { id: 'notifications', label: t('settings.tab.notifications') },
  { id: 'connections', label: t('settings.tab.connections') },
] as const;

export type TabId = (typeof TABS)[number]['id'];

export const isTabId = (s: string | undefined): s is TabId =>
  TABS.some((t) => t.id === s);

/**
 * Where each of the old one-scroll headings ended up.
 *
 * The screen used to be a single column, so every section was reachable by
 * hash. Tabs hide three quarters of it at a time, and a `#per-field-policy`
 * link that lands on a page not showing that section is a worse link than one
 * that 404s -- it looks like it worked. `settings-tabs.tsx` reads this once on
 * mount and selects the tab holding the section before the browser scrolls.
 */
export const SECTION_TAB: Record<string, TabId> = {
  'what-assay-may-publish': 'publishing',
  'per-field-policy': 'publishing',
  'where-the-data-goes': 'output',
  'model-access': 'connections',
  connections: 'connections',
  notifications: 'notifications',
};
