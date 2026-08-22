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

export async function proxy(request: NextRequest) {
  if (process.env.AUTH_MODE !== 'clerk') return NextResponse.next();

  const pkg = '@clerk/nextjs/server';
  const { clerkMiddleware } = await import(/* webpackIgnore: true */ pkg);
  return clerkMiddleware()(request);
}

export const config = {
  // Skip static assets and _next. /api/v1/* is machine-to-machine and carries
  // its own Bearer key auth (src/api/keys.js) -- operator sessions do not
  // apply there, so it stays out of this matcher.
  matcher: ['/((?!_next|api/v1|.*\\..*).*)'],
};
