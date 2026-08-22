import { Sidebar } from '@/components/sidebar';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { openDecisions, scrapers } from '@/lib/queue';

/**
 * The app shell. Sign-in sits outside this group on purpose -- it has no
 * sidebar and no operator yet.
 *
 * The waiting count is read here rather than passed down because it belongs to
 * the rail, not to the screen: it has to be right on Runs and Fields too.
 *
 * SidebarProvider reads the collapsed state from a cookie on the server, so
 * the rail renders in the right state on first paint instead of flashing open
 * and then snapping shut.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [queue, list] = await Promise.all([openDecisions(), scrapers()]);

  return (
    <SidebarProvider>
      <Sidebar waiting={queue.length} scrapers={list} />
      <SidebarInset className="min-w-0 bg-[var(--bg-page)]">{children}</SidebarInset>
    </SidebarProvider>
  );
}
