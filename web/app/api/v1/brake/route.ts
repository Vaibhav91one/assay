// GET  /api/v1/brake            -- every field currently held by a brake
// POST /api/v1/brake            -- clear one, with the field name typed out
//
// The clear is a POST on the same path rather than a DELETE because it is not a
// deletion: the brake becomes inactive and keeps a record of who made it so.
//
// Route logic lives here rather than in `src/api/handlers.ts`, which is frozen
// for this wave. The auth guard is the same `requireKey`, called the same way,
// so no route in this tree can be reached without a key.

import { z } from 'zod';
import { requireKey } from 'assay/api/keys';
import { listBrakes, clearBrake } from 'assay/engine/brake/index';

export const dynamic = 'force-dynamic';

/**
 * `confirm` is the typed confirmation and it is validated HERE, at the trust
 * boundary, not only in the module: an operator who can reach this route can
 * send any JSON, and `confirm === field` is the entire safety property.
 */
const Clear = z.object({
  target: z.string().min(1),
  field: z.string().min(1),
  confirm: z.string().min(1),
  cleared_by: z.string().min(1),
});

const fail = (status: number, error: string, detail: string): Response =>
  Response.json({ error, detail }, { status });

export async function GET(request: Request): Promise<Response> {
  const denied = await requireKey(request);
  if (denied) return denied;
  try {
    const brakes = await listBrakes(new URL(request.url).searchParams.get('target'));
    return Response.json({
      brakes: brakes.map((b) => ({
        target: b.targetId,
        field: b.field,
        brake_active: b.brakeActive,
        brake_reason: b.brakeReason,
        updated_at: b.updatedAt,
        // What clearing costs, said out loud, so the UI does not have to invent
        // it: the brake is the only thing holding this field's healing shut.
        clearing_resumes_healing: true,
        confirm_by_typing: b.field,
      })),
    });
  } catch (e) {
    console.error('[brake]', (e as Error).message);
    return fail(500, 'internal', 'Could not read brake state.');
  }
}

export async function POST(request: Request): Promise<Response> {
  const denied = await requireKey(request);
  if (denied) return denied;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail(400, 'bad_request', 'Body is not JSON.');
  }

  const parsed = Clear.safeParse(body);
  if (!parsed.success) {
    return fail(400, 'bad_request', z.prettifyError(parsed.error));
  }
  const { target, field, confirm, cleared_by } = parsed.data;

  try {
    const result = await clearBrake({ targetId: target, field, confirm, clearedBy: cleared_by });
    if (result.cleared) return Response.json(result);
    return result.reason === 'no_brake'
      ? fail(404, 'no_brake', `No active brake on ${target}/${field}.`)
      : fail(409, 'confirmation_mismatch',
        `To clear this brake, type the field name exactly: "${field}". Healing resumes immediately.`);
  } catch (e) {
    console.error('[brake]', (e as Error).message);
    return fail(500, 'internal', 'Could not clear the brake.');
  }
}
