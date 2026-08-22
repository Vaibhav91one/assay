// Proves two things a developer needs to be true before writing a screen:
// the engine resolves as a real package specifier, and the store answers.
//
// No UI here on purpose -- screens wait for the design.

import { healGated } from 'assay/engine/heal';
import { STATUSES } from 'assay/engine/envelope';
import { getDb, heldCells } from 'assay/store';

export const dynamic = 'force-dynamic';

export async function GET() {
  const health: {
    engine: { heal: boolean; statuses: string[] };
    store: { reachable: boolean; heldCells: number | null; error?: string };
  } = {
    engine: { heal: typeof healGated === 'function', statuses: STATUSES },
    store: { reachable: false, heldCells: null },
  };
  try {
    getDb();
    health.store.heldCells = (await heldCells()).length;
    health.store.reachable = true;
  } catch (e) {
    health.store.error = (e as Error).message;
  }
  return Response.json(health, { status: health.store.reachable ? 200 : 503 });
}
