// RFC9728 §3.1: the metadata URL is constructed by inserting
// `/.well-known/oauth-protected-resource` before the resource's own path --
// for `/api/mcp`, that is this file's path. Confirmed live: claude.ai's
// client tries this exact URL FIRST, before the origin-root fallback the
// sibling `../../route.ts` serves, and 404d here until this file existed
// (the client did fall back correctly when it did, but a resource this
// server has exactly one of should not depend on a client's fallback
// behaviour to be discoverable).
//
// Same document either way -- reused, not duplicated.
//
// `dynamic` is declared here directly rather than re-exported: Next's route
// segment config is read by static analysis of THIS file, and a re-export is
// not guaranteed to be seen the same way a literal `export const` is.

import { protectedResourceMetadata } from '../../route.js';

export const dynamic = 'force-dynamic';
export const GET = protectedResourceMetadata;
