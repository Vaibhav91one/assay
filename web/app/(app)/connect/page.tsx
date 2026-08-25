import type { Metadata } from 'next';
import { TopBar } from '@/components/top-bar';
import { describe } from 'assay/engine/connectors/config';
import { modelAuth } from 'assay/engine/ai/model';
import { alertsView } from '@/lib/alerts';
import { listKeys } from 'assay/api/keys';
import { ConnectView } from './connect-view';
import { CONNECT_TABS, isConnectTabId } from './tabs';
import { t } from '@/lib/copy';

export const metadata: Metadata = { title: t('title.connect') };
export const dynamic = 'force-dynamic';

/**
 * "Seven connectors, one server" (Figma `connect` 452:4741 and siblings).
 *
 * Distinct from Settings' Connections tab, which stays a read-only summary
 * with a "Manage connectors ›" link into this page — this is where the
 * config actually gets written (`connect/actions.ts`'s `putConnector`/
 * `removeConnector`, which Settings' tab never had).
 */
export default async function ConnectPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const initial = isConnectTabId(tab) ? tab : 'claude-code';

  const [presence, alerts, keys] = await Promise.all([
    describe(),
    alertsView(),
    listKeys(),
  ]);
  const auth = modelAuth();

  return (
    <>
      {/* Derived from the tab list itself, not a hand-counted literal -- "seven
          connectors" (the Figma spec this screen was built from) already drifted
          once, silently, when Slack's tab was removed and nobody updated this
          string alongside it. */}
      <TopBar title={t('title.connect')} status={`${CONNECT_TABS.length} tabs · one server`} />
      <div className="flex w-full flex-col items-start px-[20px] md:px-[56px] pb-[48px] pt-[36px]">
        <ConnectView
          initial={initial}
          presence={presence}
          mail={alerts.mail}
          auth={auth}
          keys={keys.map((k) => ({
            keyId: k.keyId, name: k.name, keyPrefix: k.keyPrefix, scope: k.scope,
            createdAt: k.createdAt.toISOString(), lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
            expiresAt: k.expiresAt?.toISOString() ?? null,
          }))}
        />
      </div>
    </>
  );
}
