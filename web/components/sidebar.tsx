import Image from 'next/image';
import Link from 'next/link';
import { Plus, ChevronsUpDown, PanelLeft, Server } from 'lucide-react';
import { getCurrentUser } from '@/lib/auth';
import { SidebarNav } from './sidebar-nav';

/**
 * The app's left rail. One component; the design draws 50 identical copies of
 * it and the only things that differ between them are `active` and the counts.
 */
export async function Sidebar({
  waiting = 0,
  scrapers = [],
}: {
  waiting?: number;
  scrapers?: { id: string; url: string }[];
}) {
  // The account chip is not decoration: on a self-hosted instance there are no
  // accounts, so it reports what `lib/auth.ts` actually knows rather than a
  // name. The Figma frame shows a personal name here, which is a hosted-case
  // artifact sitting in the self-hosted baseline.
  const user = await getCurrentUser();
  const label = user?.label ?? 'Self-hosted';
  // Initials of a label are not initials of a person: "Self-hosted" gives "SE",
  // which means nothing. Only a real identity gets initials.
  const named = user?.mode === 'clerk';
  const initials = named ? label.slice(0, 2).toUpperCase() : null;
  const shown = scrapers.slice(0, 7);

  return (
    <aside className="flex h-screen w-[272px] shrink-0 flex-col overflow-hidden bg-[var(--bg-sidebar)]">
      <div className="flex h-[68px] items-center gap-[10px] pl-[20px] pr-[48px]">
        <Image src="/brand/assay-mark.svg" alt="" width={26} height={26} className="rounded-[7px]" />
        <span className="heading-16 text-[var(--text-inverse)]">Assay</span>
        <span className="flex-1" />
        <PanelLeft size={16} strokeWidth={1.5} className="text-[#65676d]" aria-hidden />
      </div>

      <div className="px-[20px] pb-[32px]">
        <Link
          href="/?new=1"
          className="flex h-[40px] w-full items-center justify-center gap-[12px] rounded-[9px] bg-[var(--accent-brand)] px-[16px]"
        >
          <Plus size={16} strokeWidth={2} className="text-[var(--accent-on-primary)]" aria-hidden />
          <span className="body-13_5 text-[var(--accent-on-primary)]">New scrape</span>
        </Link>
      </div>

      <SidebarNav waiting={waiting} />


      <div className="flex flex-col overflow-hidden pb-[13px]">
        <div className="px-[20px]"><div className="h-px w-full bg-[#292a2e]" /></div>
        <div className="flex items-center px-[20px] pt-[23px]">
          <span className="label-10_5 text-[#65676d]">SCRAPERS</span>
          <Plus size={14} strokeWidth={1.5} className="ml-auto text-[#65676d]" aria-hidden />
        </div>
        <ul className="flex flex-col gap-[16px] px-[20px] pt-[17px]">
          {shown.map((s) => (
            <li key={s.id} className="relative flex items-center pl-[28px]">
              <span className="absolute left-[5px] size-[5px] rounded-full bg-[#65676d]" />
              <span className="body-14 truncate text-[#a3a5a9]">{s.id}</span>
            </li>
          ))}
        </ul>
        {scrapers.length > shown.length && (
          <div className="pl-[48px] pt-[22px]">
            <span className="meta-13 text-[#65676d]">Show all {scrapers.length}</span>
          </div>
        )}
      </div>

      <div className="mt-auto flex h-[68px] flex-col">
        <div className="h-px w-full bg-[#292a2e]" />
        <div className="flex items-center gap-[12px] px-[20px] pt-[13px]">
          <span className="flex size-[32px] shrink-0 items-center justify-center rounded-full bg-[#292a2e]">
            {initials
              ? <span className="caption-12 text-[var(--text-inverse)]">{initials}</span>
              : <Server size={15} strokeWidth={1.5} className="text-[#a3a5a9]" aria-hidden />}
          </span>
          <span className="flex flex-col gap-[2px]">
            <span className="body-14 text-[var(--text-inverse)]">{label}</span>
            <span className="caption-12 text-[#65676d]">
              {user?.mode === 'clerk' ? 'Signed in' : 'No accounts on this instance'}
            </span>
          </span>
          <ChevronsUpDown size={14} strokeWidth={1.5} className="ml-auto text-[#65676d]" aria-hidden />
        </div>
      </div>
    </aside>
  );
}
