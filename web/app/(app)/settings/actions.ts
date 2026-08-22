'use server';

import { modelAuth, type ModelAuth } from 'assay/engine/ai/model';

/**
 * Ask again which credential the model path has.
 *
 * A server action rather than `router.refresh()`, for two reasons that are the
 * same reason. The CLI probe spawns a binary that takes seconds, so its answer
 * is cached for the life of the process -- and a refresh would re-render the
 * page against that cache and report the stale answer with a straight face.
 * `modelAuth(true)` is the only thing that drops it. The panel is also a client
 * component holding its own state, so a value it can await is what it wants;
 * a refresh would additionally have to invalidate the whole settings tree to
 * repaint one line.
 *
 * `modelAuth` is server-only by construction -- it imports the Agent SDK, and
 * so Node built-ins -- which is exactly what `'use server'` here guarantees.
 * The panel imports this function, never that module. (`web/components/
 * chrome.ts` is the scar from the time a client import dragged `pg` into the
 * browser bundle.)
 *
 * Presence only, as everywhere else: the return is one of four words.
 */
export async function recheckModelAccess(): Promise<ModelAuth> {
  return modelAuth(true);
}
