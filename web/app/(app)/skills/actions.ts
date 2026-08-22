'use server';

import { revalidatePath } from 'next/cache';
import { statesOf, type SkillState } from 'assay/engine/skills/index';
import { enabled, enable, disable } from 'assay/engine/skills/store';

export type { SkillState };

/**
 * Every skill, with what is true about it on this machine.
 *
 * Read on the server because `satisfied` is a question about the environment of
 * the process that will actually make the request, and the browser has no
 * environment to read. Nothing crossing this boundary can hold a credential --
 * `SkillState` carries a boolean, a list of variable NAMES and fixed strings
 * written in the registry, so there is no path by which a value reaches a page.
 */
export async function list(): Promise<SkillState[]> {
  return statesOf(await enabled());
}

/**
 * Turn one on or off.
 *
 * Enabling does NOT make a skill work: it records that the operator said yes.
 * A skill whose credential is absent stays inactive and the screen keeps saying
 * which variable is missing, because those are two different facts and
 * collapsing them is how a panel ends up telling someone their setup is fine
 * when it is not.
 */
export async function setEnabled(id: string, on: boolean): Promise<SkillState[]> {
  if (on) await enable(id);
  else await disable(id);
  revalidatePath('/skills');
  // The home surface prints how a page will be read, so it is stale the moment
  // a source is enabled.
  revalidatePath('/');
  return list();
}
