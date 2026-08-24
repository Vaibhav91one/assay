// RFC6749 §4.1.3 token endpoint. Form-encoded body per spec (§4.1.3 itself,
// and every real client -- claude.ai included -- sends it that way); JSON is
// not accepted, because accepting a shape the spec does not define is a
// second contract nobody asked this server to keep.
//
// Two grants: `authorization_code` (the first token, after the operator
// approves) and `refresh_token` (RFC6749 §6, every renewal after -- the
// access token this server issues is deliberately short-lived, per
// `src/api/oauth.ts`'s own comment on why, and a client that could not renew
// silently would just stop working once an hour).
//
// `resource` (RFC8707) is read and ignored rather than rejected: this server
// has exactly one resource, `/api/mcp`, so there is nothing to disambiguate.

import { redeemAuthCode, refreshAccessToken, type TokenPair } from 'assay/api/oauth';

export const dynamic = 'force-dynamic';

const oauthError = (error: string, description: string, status = 400): Response =>
  Response.json({ error, error_description: description }, { status });

const tokenResponse = (pair: TokenPair): Response => Response.json({
  access_token: pair.accessToken,
  token_type: 'Bearer',
  expires_in: pair.expiresIn,
  refresh_token: pair.refreshToken,
});

export async function POST(request: Request): Promise<Response> {
  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.includes('application/x-www-form-urlencoded')) {
    return oauthError('invalid_request', 'Body must be application/x-www-form-urlencoded.');
  }

  const form = new URLSearchParams(await request.text());
  const grantType = form.get('grant_type');

  if (grantType === 'refresh_token') {
    const refreshToken = form.get('refresh_token');
    const clientId = form.get('client_id');
    if (!refreshToken || !clientId) {
      return oauthError('invalid_request', 'refresh_token and client_id are both required.');
    }
    const result = await refreshAccessToken({ refreshToken, clientId });
    if (!result.ok) {
      return oauthError(result.error, 'The refresh token, or the client it was issued to, did not match.');
    }
    return tokenResponse(result);
  }

  if (grantType !== 'authorization_code') {
    return oauthError(
      'unsupported_grant_type',
      'Only grant_type=authorization_code and grant_type=refresh_token are supported.',
    );
  }

  const code = form.get('code');
  const clientId = form.get('client_id');
  const redirectUri = form.get('redirect_uri');
  const codeVerifier = form.get('code_verifier');
  if (!code || !clientId || !redirectUri || !codeVerifier) {
    return oauthError('invalid_request', 'code, client_id, redirect_uri and code_verifier are all required.');
  }

  const result = await redeemAuthCode({ code, clientId, redirectUri, codeVerifier });
  if (!result.ok) {
    return oauthError(result.error, 'The code, client, redirect_uri, or PKCE verifier did not match.');
  }

  return tokenResponse(result);
}
