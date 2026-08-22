// Which skills the operator has said yes to.
//
// A FILE, NOT A TABLE, and for the same reason `src/connectors/config.ts` is a
// file: the chat-session feature owns the schema this wave and is adding a
// conversations table, so a competing migration from here would be two branches
// writing 0005. This holds no secret and no user data -- it is a list of ids the
// operator ticked -- so a 0600 JSON file beside the connector config is the
// whole requirement.
//
// IT HOLDS IDS AND NOTHING ELSE. There is no config blob per skill and no slot
// for one. A skill's credential lives in the environment and is read by the code
// that uses it; this file records consent, which is a different fact and the
// only one a browser is allowed to change. Writing "enabled" is therefore not a
// write of anything sensitive, and reading it back cannot disclose anything.
//
// An unknown id is DROPPED on read rather than kept. A build that removes a
// skill should not leave the store quietly re-enabling it if the id ever comes
// back, and a hand-edited file naming something that does not exist should not
// become an error the operator has to find.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { skillById } from './index.js';

export const STORE_PATH = (): string => process.env.ASSAY_SKILLS || 'data/skills.json';

/** The ids the operator has enabled, filtered to ones this build has. */
export async function enabled(): Promise<string[]> {
  let raw: string;
  try {
    raw = await readFile(STORE_PATH(), 'utf8');
  } catch (e) {
    // A missing file means nothing has been enabled yet. Anything else -- a
    // permission error, a directory in the way -- is a real fault, and reading
    // it as "nothing enabled" would silently turn a connector off.
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw e;
  }
  const parsed: unknown = JSON.parse(raw);
  const ids = Array.isArray((parsed as { enabled?: unknown })?.enabled)
    ? (parsed as { enabled: unknown[] }).enabled
    : [];
  return ids.filter((v): v is string => typeof v === 'string' && Boolean(skillById(v)));
}

/** Turn one on. Refuses an id this build does not have. Idempotent. */
export async function enable(id: string): Promise<string[]> {
  const skill = skillById(id);
  if (!skill) throw new Error(`no skill "${id}"`);
  // `always` is not a choice and must not become a stored one: a row written
  // here could later be removed, and the removal would read as "the operator
  // turned off fetching". `stateOf` reports it on regardless.
  if (skill.always) return enabled();
  const now = await enabled();
  return write(now.includes(id) ? now : [...now, id]);
}

/** Turn one off. Removing what is not there is not an error. */
export async function disable(id: string): Promise<string[]> {
  return write((await enabled()).filter((v) => v !== id));
}

async function write(ids: string[]): Promise<string[]> {
  const path = STORE_PATH();
  await mkdir(dirname(path), { recursive: true });
  // 0600 to match the connector config beside it. Nothing secret is in here,
  // but a file the browser can cause to be written is a file worth keeping to
  // the owner, and two files in `data/` with different modes invite the question
  // of which rule is the real one.
  await writeFile(path, `${JSON.stringify({ enabled: ids }, null, 2)}\n`, { mode: 0o600 });
  return ids;
}
