import type { Metadata } from 'next';
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
        <SkillsList initial={skills} />
      </div>
    </>
  );
}
