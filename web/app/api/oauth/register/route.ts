// RFC7591 Dynamic Client Registration. Open -- no operator session, no API
// key -- which is correct per spec: a client cannot have credentials for a
// server it has never talked to before. What stops this from handing out
// working access is everything downstream of it: a registered client_id
// still needs an operator to approve it at `/oauth/authorize` before any
// code, let alone a token, ever exists.

import { registerClient } from 'assay/api/oauth';

export const dynamic = 'force-dynamic';

const badRequest = (detail: string): Response =>
  Response.json({ error: 'invalid_client_metadata', error_description: detail }, { status: 400 });

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest('Body must be JSON.');
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return badRequest('Body must be a JSON object.');
  }

  const input = body as Record<string, unknown>;
  const client = await registerClient({
    redirectUris: input.redirect_uris,
    clientName: input.client_name,
  });
  if (!client) {
    return badRequest(
      'redirect_uris must be a non-empty array of https:// URLs (localhost http:// is also accepted).',
    );
  }

  return Response.json(
    {
      client_id: client.clientId,
      client_id_issued_at: Math.floor(Date.now() / 1000),
      client_name: client.clientName ?? undefined,
      redirect_uris: client.redirectUris,
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code'],
      response_types: ['code'],
    },
    { status: 201 },
  );
}
