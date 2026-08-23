import Image from 'next/image';
import Link from 'next/link';
import { Plus, Server } from 'lucide-react';
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
import { t } from '@/lib/copy';

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
  const label = user?.label ?? t('nav.selfHosted');
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
          {/*
            The icon swap, on a `<Link>`. `Button` applies `icon-swap` itself
            when a variant has a left glyph and a label, and this is a link
            rather than a button -- a destination you can middle-click, and an
            entry in a screen reader's link list -- so it was the one control
            with both that never got the effect.

            WHY THE CLIP IS ON AN INNER SPAN AND NOT ON THE LINK. The swap
            parks the arriving copy past the RIGHT EDGE OF THE CONTENT BOX:
            `margin-inline-start: -(slot + gap)` puts its box flush with that
            edge and `translateX(200%)` carries it out beyond. On a `Button`
            that shrink-wraps its label, the content edge and the visible edge
            are the same place, so the clip catches it. This link is
            `w-full justify-center`, so its content box is the whole rail and
            "flush with the content edge" is the MIDDLE of the button -- the
            parked copy landed in plain sight next to the label, two plus signs
            at rest. Putting `icon-swap` on a shrink-wrapped span around the
            three pieces restores the geometry the effect was written against,
            and does it without the link giving up `w-full`.

            IT COEXISTS WITH THE SHIMMER, and this is the arrangement that
            makes that true rather than a coincidence: `overflow: hidden` now
            lives on the inner span, so the rim light -- an `inset: 0`
            pseudo-element on the link, `border-radius: inherit`, `pointer-
            events: none` -- is not inside anything that clips it. The white
            bleed under the button was that clip cutting the rim, and it goes
            with the clip.

            COLLAPSED TO ICONS the label is `display: none` and the span is
            16px wide, and the swap still reads correctly: measured in the
            browser, the leaving copy ends at -2px and the arriving one lands
            exactly on the 16px slot, so the rail shows one glyph throughout
            rather than the two the full-width version was showing at rest.
            The `aria-label` is for that state and is not decoration -- with the
            label hidden this link had no accessible name at all.
          */}
          <Link
            href="/?new=1"
            aria-label="New scrape"
            className={actionVariants({
              variant: 'primary',
              className: 'shimmer-edge relative w-full justify-center group-data-[collapsible=icon]:px-0',
            })}
          >
            <span
              className="icon-swap inline-flex items-center gap-[var(--action-gap)]"
              style={{ '--swap-slot': '16px' } as React.CSSProperties}
            >
              <Plus size={16} strokeWidth={2} className="swap-lead shrink-0" aria-hidden />
              <span className="swap-label group-data-[collapsible=icon]:hidden">New scrape</span>
              <Plus size={16} strokeWidth={2} className="swap-trail shrink-0" aria-hidden />
            </span>
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
        {/* One space unit between the avatar and the name, not one and a half.
            The rail is a fixed 272px and the identity block is the only row in
            it that has to fit three things side by side; at the larger caption
            "No accounts on this instance" needed 168px of a 162px column and
            lost its last word. The four pixels come from here rather than from
            the 20px inset, which is the rail's left edge and lines up with
            every label above it. */}
        <div className="flex items-center gap-[8px] px-[20px] py-[13px] group-data-[collapsible=icon]:px-[12px]">
          <span className="flex size-[32px] shrink-0 items-center justify-center rounded-full bg-[#292a2e]">
            {initials
              ? <span className="caption-12 text-[var(--text-inverse)]">{initials}</span>
              : <Server size={15} strokeWidth={1.5} className="text-[#a3a5a9]" aria-hidden />}
          </span>
          <span className="flex min-w-0 flex-col gap-[2px] group-data-[collapsible=icon]:hidden">
            <span className="body-14 truncate text-[var(--text-inverse)]">{label}</span>
            <span className="caption-12 truncate text-[#65676d]">
              {named ? t('nav.signedIn') : t('nav.noAccounts')}
            </span>
          </span>
          {/* THE CHEVRON CAME OFF, and this is the whole change: a
              `ChevronsUpDown` sat here, which is the account-switcher glyph in
              every product that has one. There is no account switcher. There
              are no accounts -- the line directly above it says so in as many
              words -- so the row was drawing the affordance for a menu that
              cannot exist, on a self-hosted instance where the offer is not
              merely unbuilt but meaningless. `docs/STATES.md` 1 #11: everything
              that looks clickable has a defined consequence, or it does not
              exist. What is left is an identity read off `lib/auth.ts`, which
              is a fact and not a control, and it now looks like one. */}
        </div>
      </SidebarFooter>
    </Rail>
  );
}
