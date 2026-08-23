'use server';

import type { CommandName } from 'assay/engine/store/conversation-log';
import { readCommandView } from '@/lib/commands';
import { assertOperator } from '@/lib/auth';

export type { CommandResult, CommandView } from '@/lib/commands';

/**
 * The auth wrapper over `readCommandView`, and deliberately nothing else.
 *
 * A Server Action is reachable by POST to the page's own url with an action id
 * and goes through no route handler, so this guard is the door -- see
 * `test/actions-auth.test.ts`, which calls every export of every `'use server'`
 * module and requires each to refuse before it reads an argument. It is the
 * first statement here for that reason.
 *
 * The read itself is `web/lib/commands.ts`. Splitting them is not ceremony: that
 * module is importable by a test and this one is not, and its header says why.
 */
export async function readCommand(name: CommandName) {
  await assertOperator();
  return readCommandView(name);
}
