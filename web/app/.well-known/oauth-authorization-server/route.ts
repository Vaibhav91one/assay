// RFC8414 Authorization Server Metadata -- Assay is its own authorization
// server for `/api/mcp` (`src/api/oauth.ts`'s header explains why: a token
// here is a real Assay API key, so there is no third party to delegate to).
// `token_endpoint_auth_methods_supported: ['none']` is not an oversight --
// this server issues no client secrets (public clients, PKCE-proven), so
// "none" is the accurate value, not a weaker one substituted for it.

import { canonicalOrigin } from 'assay/api/oauth';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  const origin = canonicalOrigin(request);
  return Response.json({
    issuer: origin,
    authorization_endpoint: `${origin}/oauth/authorize`,
    token_endpoint: `${origin}/api/oauth/token`,
    registration_endpoint: `${origin}/api/oauth/register`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
  });
}
