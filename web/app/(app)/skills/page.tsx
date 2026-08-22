import type { Metadata } from 'next';
import Link from 'next/link';
import { TopBar } from '@/components/top-bar';
import { list } from './actions';
import { SkillsList } from './skills-list';

export const metadata: Metadata = { title: 'Skills · Assay' };
export const dynamic = 'force-dynamic';

/**
 * What Assay can be given, and what each thing wants in return.
 *
 * Read on the server: `satisfied` is a question about the environment of the
 * process that will make the request, and a browser has none to read. The rows
 * that arrive carry booleans, variable NAMES and strings written in the
 * registry -- never a credential's value, which `SkillState` has nowhere to
 * hold.
 */
export default async function SkillsPage() {
  const skills = await list();
  const active = skills.filter((s) => s.active).length;

  return (
    <>
      <TopBar title="Skills" status={`${active} in use`} />
      <div className="flex w-full max-w-[860px] flex-col gap-[20px] pl-[56px] pr-[32px] pt-[18px]">
        <p className="caption-13 text-[var(--text-secondary)]">
          Everything Assay can be given, and exactly what each one asks for before you
          say yes. A page is read with a direct request first; a source you enable here
          is tried only when that request is refused, and the bytes it returns go through
          the same gate as every other page.
        </p>
        {/* The second half of the same shelf. This screen is a registry of what
            may be given to Assay; the Library is a registry of what to point it
            at. Same idiom -- real entries, each stating what it wants before you
            say yes -- and a different noun, which is why they are two screens
            and not one list with a divider in it. */}
        <p className="caption-12_5 text-[var(--text-muted)]">
          Looking for something to watch rather than a way to read it? The{' '}
          <Link href="/library" className="text-[var(--semantic-link)] hover:underline">
            Library
          </Link>{' '}
          holds field contracts for page shapes — a set of fields and a tier for each, to
          point at a URL of yours.
        </p>
        <SkillsList initial={skills} />
      </div>
    </>
  );
}
