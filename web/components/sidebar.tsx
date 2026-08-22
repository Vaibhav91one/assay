import Image from 'next/image';
import Link from 'next/link';
import { Plus, ChevronsUpDown, Server } from 'lucide-react';
import { getCurrentUser } from '@/lib/auth';
import {
  Sidebar as Rail,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarSeparator,
} from '@/components/ui/sidebar';
import { SidebarNav, ScraperList } from './sidebar-nav';
import { ConversationList } from './conversation-list';
import { actionVariants } from './button';

/**
 * The app's left rail, on shadcn's Sidebar.
 *
 * What that buys is the collapse the design draws but a hand-rolled rail could
 * only mime: real collapsed/expanded state, a cookie so it survives a reload,
 * a keyboard shortcut, and a Sheet on mobile. The header's collapse icon
 * becomes a control rather than a picture of one.
 *
 * The palette is bound in shadcn-bridge.css, not here. `shadcn add sidebar`
 * writes eight raw HSL values and a `.dark` block into globals.css; that block
 * was reverted and the names mapped onto our tokens instead, so there is still
 * one palette rather than two free to drift.
 */
export async function Sidebar({
  waiting = 0,
  scrapers = [],
  conversations = [],
}: {
  waiting?: number;
  /** Scrapers no conversation owns. The layout filters the owned ones out. */
  scrapers?: { id: string; url: string; fields: number }[];
  conversations?: { id: number; title: string; scraperSlug: string | null; turns: number }[];
}) {
  // Not decoration: on a self-hosted instance there are no accounts, so this
  // reports what lib/auth.ts actually knows. The Figma frame shows a personal
  // name, which is a hosted-case artifact sitting in the self-hosted baseline.
  const user = await getCurrentUser();
  const label = user?.label ?? 'Self-hosted';
  // Initials of a label are not initials of a person: "Self-hosted" gives
  // "SE", which means nothing. Only a real identity gets initials.
  const named = user?.mode === 'clerk';
  const initials = named ? label.slice(0, 2).toUpperCase() : null;

  return (
    <Rail collapsible="icon" className="border-none">
      <SidebarHeader className="h-[68px] flex-row items-center gap-[10px] px-[20px]">
        <Image src="/brand/assay-mark.svg" alt="" width={26} height={26} className="shrink-0 rounded-[7px]" />
        <span className="heading-16 truncate text-[var(--text-inverse)] group-data-[collapsible=icon]:hidden">
          Assay
        </span>
      </SidebarHeader>

      <SidebarContent className="gap-0 overflow-x-hidden">
        <div className="px-[20px] pb-[32px] group-data-[collapsible=icon]:px-[12px]">
          {/*
            `shimmer-edge` is the light that travels around this button's rim,
            and this is the only button in the product that wears it. It is a
            layer on top of an ordinary primary control -- press, focus and the
            disabled state are untouched, because the effect is one
            pointer-events: none pseudo-element and nothing else. Under
            prefers-reduced-motion it is not drawn at all and what is left is a
            plain solid orange button. See docs/MOTION.md, which records both
            the numbers and the argument against having it.
          */}
          <Link
            href="/?new=1"
            className={actionVariants({
              variant: 'primary',
              className:
                'shimmer-edge relative w-full justify-center group-data-[collapsible=icon]:px-0',
            })}
          >
            <Plus size={16} strokeWidth={2} className="shrink-0" aria-hidden />
            <span className="group-data-[collapsible=icon]:hidden">New scrape</span>
          </Link>
        </div>

        <SidebarNav waiting={waiting} />

        <SidebarSeparator className="mx-[20px] bg-[#292a2e] group-data-[collapsible=icon]:hidden" />

        {/* Conversations first, because a conversation is the thing that makes
            a scraper -- the rail reads in the order the work happens. */}
        <SidebarGroup className="gap-0 pt-[23px] group-data-[collapsible=icon]:hidden">
          <SidebarGroupLabel className="label-10_5 h-auto px-0 text-[#65676d]">CHATS</SidebarGroupLabel>
          <SidebarGroupAction
            render={<Link href="/" />}
            className="text-[#65676d] hover:bg-[#292a2e] hover:text-[var(--text-inverse)]"
          >
            <Plus size={14} strokeWidth={1.5} aria-hidden />
            <span className="sr-only">Start a new conversation</span>
          </SidebarGroupAction>
          <SidebarGroupContent className="pt-[17px]">
            <ConversationList conversations={conversations} />
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Only the scrapers no conversation owns. This group is absent on an
            instance where every scraper came from a chat, and it never claims
            one of these has a transcript -- they do not, and none is invented. */}
        {scrapers.length > 0 && (
          <SidebarGroup className="gap-0 pt-[23px] group-data-[collapsible=icon]:hidden">
            <SidebarGroupLabel className="label-10_5 h-auto px-0 text-[#65676d]">
              SCRAPERS WITH NO CHAT
            </SidebarGroupLabel>
            <SidebarGroupContent className="pt-[17px]">
              <ScraperList scrapers={scrapers} />
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="p-0">
        <div className="h-px w-full bg-[#292a2e]" />
        <div className="flex items-center gap-[12px] px-[20px] py-[13px] group-data-[collapsible=icon]:px-[12px]">
          <span className="flex size-[32px] shrink-0 items-center justify-center rounded-full bg-[#292a2e]">
            {initials
              ? <span className="caption-12 text-[var(--text-inverse)]">{initials}</span>
              : <Server size={15} strokeWidth={1.5} className="text-[#a3a5a9]" aria-hidden />}
          </span>
          <span className="flex min-w-0 flex-col gap-[2px] group-data-[collapsible=icon]:hidden">
            <span className="body-14 truncate text-[var(--text-inverse)]">{label}</span>
            <span className="caption-12 truncate text-[#65676d]">
              {named ? 'Signed in' : 'No accounts on this instance'}
            </span>
          </span>
          <ChevronsUpDown
            size={14}
            strokeWidth={1.5}
            className="ml-auto shrink-0 text-[#65676d] group-data-[collapsible=icon]:hidden"
            aria-hidden
          />
        </div>
      </SidebarFooter>
    </Rail>
  );
}
