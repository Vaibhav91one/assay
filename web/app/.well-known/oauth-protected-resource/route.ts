// RFC9728 Protected Resource Metadata -- the first thing an MCP client fetches
// after `/api/mcp` answers 401 (see that route's `WWW-Authenticate` header,
// which points here). Says one thing: which authorization server issues
// tokens this resource accepts. No auth of its own -- a client cannot know
// where to authenticate without reading this first.
//
// Exported so `.well-known/oauth-protected-resource/api/mcp/route.ts` can
// reuse it rather than duplicate it -- see that file for why both paths exist.

import { canonicalOrigin } from 'assay/api/oauth';

export const dynamic = 'force-dynamic';

export function protectedResourceMetadata(request: Request): Response {
  const origin = canonicalOrigin(request);
  return Response.json({
    resource: `${origin}/api/mcp`,
    authorization_servers: [origin],
    bearer_methods_supported: ['header'],
  });
}

export const GET = protectedResourceMetadata;
