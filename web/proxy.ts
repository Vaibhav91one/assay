// Mounted always, active only on the hosted path.
//
// Named `proxy`, not `middleware`: Next 16 renamed the file convention and
// deprecated the old name (nextjs.org/docs/messages/middleware-to-proxy,
// checked 2026-08-22). The rename also moves it off the Edge runtime onto
// Node, which suits the one thing this file does -- a dynamic `import()` of
// an optional package that a self-hoster has not installed.
//
// Next resolves middleware at build time, so this file cannot be conditionally
// created -- the condition has to live inside it. With AUTH_MODE unset (the
// self-host default) it is a pass-through and Clerk is never imported.

import { NextResponse, type NextRequest } from 'next/server';

/**
 * What a signed-out request may still reach on the hosted instance.
 *
 * `/sign-in` has to be here or the guard redirects the sign-in page to itself.
 * `/api/health` has to be here because the thing that calls it is a load
 *  balancer, which has no session and never will.
 * `/__clerk` is Clerk's own handshake; protecting it breaks the flow that
 *  issues the session this file is checking for.
 *
 * Everything else needs an operator. Deny by default: a route added tomorrow is
 * protected on the day it is added, without anyone remembering to list it.
 */
const PUBLIC = /^\/(sign-in|api\/health|__clerk)(\/|$)/;

export async function proxy(request: NextRequest) {
  if (process.env.AUTH_MODE !== 'clerk') return NextResponse.next();

  const pkg = '@clerk/nextjs/server';
  const { clerkMiddleware } = await import(/* webpackIgnore: true */ pkg);

  // The handler is the whole point, and calling `clerkMiddleware()` WITHOUT one
  // was this file's bug: bare, it attaches a session to the request and
  // protects nothing. Clerk documents that plainly -- "by default,
  // clerkMiddleware() will not protect any routes" -- so every operator screen
  // and every Server Action under this matcher answered 200 to a request with
  // no session at all. Measured on 2026-08-22, AUTH_MODE=clerk, no cookie:
  // GET /decisions -> 200, and a same-origin POST of the `resolveCell` Server
  // Action reached the store and answered from it.
  //
  // Next's own guidance is that a proxy "should not be used as a full session
  // management or authorization solution" -- it is an optimistic check. So this
  // is the outer of two gates, not the only one: `getCurrentUser()` is checked
  // again at the resource (see web/app/api/chat/route.ts), because a matcher is
  // one careless edit away from not covering a path.
  //
  // Where a signed-out visitor lands is Clerk's to decide, and it defaults to
  // Clerk's hosted Account Portal. Assay ships its own /sign-in, so a hosted
  // deployment must set NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in or the redirect
  // leaves the instance.
  // TODO(types): `auth` comes from an optional package that is deliberately not
  // a dependency here, so there is no type to import for it.
  return clerkMiddleware(async (auth: any, req: NextRequest) => {
    if (!PUBLIC.test(req.nextUrl.pathname)) await auth.protect();
  })(request);
}

export const config = {
  // Skip static assets and _next. /api/v1/* is machine-to-machine and carries
  // its own Bearer key auth (src/api/keys.js) -- operator sessions do not
  // apply there, so it stays out of this matcher.
  matcher: ['/((?!_next|api/v1|.*\\..*).*)'],
};
