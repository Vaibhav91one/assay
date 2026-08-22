import { Sidebar } from '@/components/sidebar';
import { openDecisions, scrapers } from '@/lib/queue';

/**
 * The app shell. Sign-in sits outside this group on purpose -- it has no
 * sidebar and no operator yet.
 *
 * The waiting count is read here rather than passed down because it belongs to
 * the rail, not to the screen: it has to be right on Runs and Fields too.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [queue, list] = await Promise.all([openDecisions(), scrapers()]);

  return (
    <div className="flex min-h-screen items-stretch bg-[var(--bg-page)]">
      <Sidebar waiting={queue.length} scrapers={list} />
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">{children}</main>
    </div>
  );
}
