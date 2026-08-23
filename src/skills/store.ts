// Which page sources the operator has said yes to.
//
// READ ONLY SINCE THE SKILLS SCREEN WENT. `enable()` and `disable()` lived here
// to serve one caller -- `web/app/(app)/skills/actions.ts` -- and that screen
// was removed as superseded by `/library`. Keeping two exported writers with no
// writer left is how a module rots, so the write path went with the screen and
// the file is now what the operator hands Assay rather than what a browser
// causes Assay to write.
//
// The consent gate itself is NOT removed, and must not be. `./page.ts` reaches
// a fallback source only when the id is in this file AND the credential is in
// the environment, and those are two separate facts on purpose: a key sitting
// in a shell is not permission to send someone's traffic to a third party. To
// turn Firecrawl on, write the file (or point ASSAY_SKILLS at one):
//
//   echo '{"enabled":["firecrawl"]}' > data/skills.json
//
// A FILE, NOT A TABLE, for the same reason `src/connectors/config.ts` is a
// file: it holds no secret and no user data -- it is a list of ids -- so a JSON
// file beside the connector config is the whole requirement.
//
// An unknown id is DROPPED on read rather than kept. A build that removes a
// source should not leave the store quietly re-enabling it if the id ever comes
// back, and a hand-edited file naming something that does not exist should not
// become an error the operator has to find.

import { readFile } from 'node:fs/promises';
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
