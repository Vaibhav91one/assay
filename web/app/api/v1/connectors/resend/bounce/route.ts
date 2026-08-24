// Resend's own webhook, not the operator-session or consumer-key surfaces:
// Resend has neither a browser session nor an Assay API key, only the shared
// signing secret it and the operator both hold. Under `/api/v1` so
// `web/proxy.ts`'s session gate does not apply (see that file's matcher) --
// this route supplies its own, different authentication.

import { verifyResendWebhook, parseResendEvent, reactToResendEvent, ResendWebhookError } from 'assay/engine/connectors/resend-bounce';

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    // 503, not 404: an unconfigured receiver must fail CLOSED, the same
    // property `web/app/api/v1/connectors/[kind]/delivery/[target]/route.ts`
    // asserts for an unconfigured Bright Data connector -- "not found" would
    // say this could never be reached; "unavailable" says correctly that it
    // could be, once RESEND_WEBHOOK_SECRET is set.
    return Response.json({ error: 'not_configured', detail: 'RESEND_WEBHOOK_SECRET is not set.' }, { status: 503 });
  }

  const rawBody = await request.text();
  try {
    verifyResendWebhook(
      {
        id: request.headers.get('svix-id'),
        timestamp: request.headers.get('svix-timestamp'),
        signature: request.headers.get('svix-signature'),
      },
      rawBody,
      secret,
    );
    const event = parseResendEvent(rawBody);
    const result = await reactToResendEvent(event);
    return Response.json({ type: event.type, ...result });
  } catch (e) {
    if (e instanceof ResendWebhookError) {
      return Response.json({ error: e.code, detail: e.message }, { status: e.status });
    }
    console.error('[resend-bounce]', (e as Error).message);
    return Response.json({ error: 'internal' }, { status: 500 });
  }
}
