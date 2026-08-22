// The chat surface, as plain functions. `web/app/api/chat/route.ts` stays a
// thin wrapper so this is testable without booting Next, and a Server Action
// calls `converse` directly and skips all of it.
//
// Nothing here writes. A confirmed proposal is posted to `/api/v1/targets` --
// the same endpoint a human filling the form by hand posts to, so there is no
// second write path and no path where a model's proposal is applied without a
// person having said yes to it.

import { z } from 'zod';
import { guarded, parseBody } from '../setup/http.js';
import { converse, hasKey, CADENCES } from './index.js';

const Body = z.strictObject({
  message: z.string().min(1).max(4000),
  history: z.array(z.strictObject({
    role: z.enum(['operator', 'assay']),
    text: z.string().max(4000),
  })).max(40).optional(),
});

/**
 * GET /api/chat -- is there a model, and what does the box do without one?
 *
 * Presence only. The key is never returned, logged or echoed, and this answers
 * before any conversation starts so the screen can render the manual path
 * immediately instead of discovering it on the operator's first message.
 */
export const getChat = guarded(async () =>
  Response.json({
    model_configured: hasKey(),
    cadences: CADENCES,
    degrades_to: hasKey() ? null : {
      field_inference: 'unavailable',
      setup: 'manual',
      detail: 'Assay runs with no model configured. Describe the fields yourself '
        + 'and everything else -- the gate, the queue, the proof records -- is unchanged.',
    },
  }));

/**
 * POST /api/chat -- one turn.
 *
 * Answers 200 with `kind: 'manual'` when no model is configured. That is not an
 * error: the manual path is a real path, and returning 503 would make the
 * screen treat a supported configuration as a fault.
 */
export const postChat = guarded(async (request) => {
  const body = await parseBody(request, Body);
  if (!body.ok) return body.response;
  return Response.json(await converse(body.data));
});
