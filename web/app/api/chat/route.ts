// The chat surface. `src/agent/http.ts` holds the behaviour; this file holds
// the operator session, because the session is a web concern and the engine
// has no business importing one.
//
// `sessionGuarded` over there is named for the gate it RELIES on, not one it
// applies: it catches errors so a driver message never reaches a consumer, and
// it leaves authentication to this layer. That gate is checked twice -- in
// `web/proxy.ts` for the whole matcher, and here on the resource -- because
// Next documents a proxy as an optimistic check rather than an authorization
// solution.
//
// With AUTH_MODE unset this costs one frozen-object read and denies nothing:
// self-host has one operator and no signed-out state.

import { getChat, postChat } from 'assay/engine/agent/http';
import { requireOperator } from '@/lib/auth';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<Record<string, string>> };

export const GET = async (request: Request, ctx: Ctx): Promise<Response> =>
  (await requireOperator()) ?? getChat(request, ctx);

export const POST = async (request: Request, ctx: Ctx): Promise<Response> =>
  (await requireOperator()) ?? postChat(request, ctx);
