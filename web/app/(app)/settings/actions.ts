'use server';

import { revalidatePath } from 'next/cache';
import { modelAuth, type ModelAuth } from 'assay/engine/ai/model';
import { alertsView, setDigestEnabled } from '@/lib/alerts';

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

/**
 * What the switch gets back, and why it is the state rather than an
 * acknowledgement.
 *
 * `enabled` is re-read from the store after the write instead of echoing the
 * argument. A switch that returns "yes, I did that" can only ever agree with
 * itself; a switch that returns what the row now says can disagree, and a
 * control over a setting this product will act on has to be able to disagree.
 */
export type DigestOutcome = { ok: true; enabled: boolean } | { ok: false; detail: string };

export async function setDigest(on: boolean): Promise<DigestOutcome> {
  if (typeof on !== 'boolean') return { ok: false, detail: 'Not a switch position.' };

  try {
    await setDigestEnabled(on);
  } catch (e) {
    // The store is the only thing that can fail here, and the caller has to put
    // the switch back where it was. Saying which failure it was is the
    // difference between "try again" and "start Postgres" -- but first line
    // only, the same cut `sendDueDigests` makes: a driver error carries the
    // whole failed statement after the newline, and a settings row is not where
    // anyone reads SQL.
    return { ok: false, detail: (e as Error).message.split('\n')[0]! };
  }

  revalidatePath('/settings');
  return { ok: true, enabled: (await alertsView()).digest.enabled };
}
