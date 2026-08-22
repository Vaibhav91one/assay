import { Sidebar } from '@/components/sidebar';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { openDecisions, scrapers } from '@/lib/queue';
import { listConversations } from 'assay/engine/store/conversations';

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
  const [queue, list, chats] = await Promise.all([
    openDecisions(),
    scrapers(),
    listConversations(),
  ]);

  // A scraper that no conversation owns. Every target created before the
  // `conversations` table is one, and so is anything the REST surface or the CLI
  // made. They keep their own group in the rail rather than being folded in
  // under a conversation that does not exist -- see `ConversationList`.
  const owned = new Set(chats.map((c) => c.scraperSlug).filter(Boolean));
  const unchatted = list.filter((s) => !owned.has(s.id));

  return (
    <SidebarProvider>
      <Sidebar
        waiting={queue.length}
        scrapers={unchatted}
        conversations={chats.map((c) => ({
          id: c.id, title: c.title, scraperSlug: c.scraperSlug, turns: c.turns,
        }))}
      />
      <SidebarInset className="min-w-0 bg-[var(--bg-page)]">{children}</SidebarInset>
    </SidebarProvider>
  );
}
