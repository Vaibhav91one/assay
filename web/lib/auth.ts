// The one place that knows whether this deployment has accounts.
//
// Self-host is single-operator: the person running it is already behind
// their own access control, so AUTH_MODE defaults to `none` and a clone
// boots with no keys, no account and no signup. Hosted sets AUTH_MODE=clerk.
//
// The rule that keeps these two from becoming two codebases: NOTHING
// downstream imports @clerk/nextjs. Routes, layouts and handlers call
// getCurrentUser() and get the same shape either way. test/auth.test.js
// enforces that by grep, because a seam nobody checks is a seam that rots.
//
// @clerk/nextjs is deliberately NOT a dependency -- a self-hoster should not
// download an auth SDK they will never load. Hosted installs it explicitly.

/** Who is making a request, whichever deployment this is. */
export interface CurrentUser {
  id: string;
  mode: 'none' | 'clerk';
  label: string;
}

/** Single-operator identity. Not a fake user -- there is genuinely one operator. */
const OPERATOR: CurrentUser = Object.freeze({
  id: 'operator',
  mode: 'none',
  label: 'Self-hosted',
});

export const authMode = (): 'clerk' | 'none' =>
  process.env.AUTH_MODE === 'clerk' ? 'clerk' : 'none';

/**
 * Who is making this request.
 * Returns `{ id, mode, label }`, or null when Clerk is on and nobody is signed in.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  if (authMode() === 'none') return OPERATOR;

  // Specifier in a variable so the bundler cannot statically resolve it --
  // that is what makes the package genuinely optional rather than merely
  // absent from the import graph at runtime.
  const pkg = '@clerk/nextjs/server';
  // TODO(types): `auth` comes from an optional package that is deliberately
  // not a dependency here, so there is no type to import for it.
  let auth: any;
  try {
    ({ auth } = await import(/* webpackIgnore: true */ pkg));
  } catch {
    throw new Error(
      'AUTH_MODE=clerk but @clerk/nextjs is not installed. ' +
        'Run `npm install @clerk/nextjs`, or unset AUTH_MODE to run single-operator.',
    );
  }

  const { userId, sessionClaims } = await auth();
  if (!userId) return null;
  return {
    id: userId,
    mode: 'clerk',
    label: sessionClaims?.email ?? userId,
  };
}

/**
 * The operator, or the 401 to send instead.
 *
 * `web/proxy.ts` already turns signed-out traffic away on the hosted path, but
 * Next documents a proxy as an OPTIMISTIC check that "should not be used as a
 * full session management or authorization solution", and Clerk says the same:
 * protect "as close to the resource as possible". A route that is safe only
 * because of a regex in another file is safe until someone edits that regex.
 *
 * So this is the second gate, and it is the one that sits on the data. On the
 * self-host path `getCurrentUser()` returns the single operator and this is a
 * pass-through -- callers get one code path for both deployments, which is the
 * same bargain the rest of the seam makes.
 */
export async function requireOperator(): Promise<Response | null> {
  if (await getCurrentUser()) return null;
  return Response.json(
    { error: 'unauthorized', detail: 'Sign in to use this instance.' },
    { status: 401 },
  );
}

/** What a refused Server Action throws. Named so a test can assert the reason. */
export class Unauthorized extends Error {}

/**
 * The same gate, for a Server Action.
 *
 * WHY A SECOND FUNCTION. `requireOperator()` answers with a `Response`, which is
 * what a route handler returns. A Server Action returns its own value to the
 * client -- there is no status code to hand back and no way to make a caller
 * that ignores the return value safe. So this throws, and the first line of
 * every action is a call to it. An action that forgets is the failure this is
 * meant to survive, which is why test/actions-auth.ts calls every exported
 * action in the four action files rather than grepping for the line.
 *
 * WHY IT WAS NEEDED. A Server Action is reachable by POST to the page's own url
 * with an action id -- it goes through no route handler at all, so until now
 * `web/proxy.ts` was its only gate. Next documents a proxy as an OPTIMISTIC
 * check, and an audit demonstrated exactly what that means here: with
 * AUTH_MODE=clerk and no session, an anonymous same-origin POST of `resolveCell`
 * reached the database and was answered from it. With a real proof id that POST
 * would have settled a held decision.
 *
 * SELF-HOST IS UNCHANGED, DELIBERATELY. With AUTH_MODE unset `getCurrentUser()`
 * returns the single operator -- never null, which test/auth.test.ts pins -- so
 * this returns without doing anything. Self-host has no accounts and no
 * signed-out state by design; a guard that started demanding one there would be
 * this seam breaking the product it exists to keep whole. This makes HOSTED
 * correct. It is not supposed to make self-host different.
 */
export async function assertOperator(): Promise<void> {
  if (await getCurrentUser()) return;
  throw new Unauthorized('Sign in to use this instance.');
}

/**
 * Revoke the caller's Clerk session, hosted only.
 *
 * `web/app/sign-out/route.ts` is the only caller, and stays free of the string
 * `@clerk/nextjs` for the same reason every other file downstream does -- see
 * this file's own header and `test/auth.test.ts`'s "is the only module that
 * names Clerk". Revoking is enough: `proxy.ts`'s `clerkMiddleware(...).auth
 * .protect()` re-validates the session on the very next request, so a revoked
 * one fails that check and the existing redirect-to-sign-in fires unchanged.
 * No second protect() path is added here to keep in sync with that one.
 *
 * A no-op on self-host: there is no session there to revoke.
 */
export async function signOutCurrentSession(): Promise<void> {
  if (authMode() !== 'clerk') return;

  const pkg = '@clerk/nextjs/server';
  // TODO(types): optional package, no type import available.
  const { auth, clerkClient } = await import(/* webpackIgnore: true */ pkg);

  const { sessionId } = await auth();
  if (!sessionId) return;
  const client = await clerkClient();
  await client.sessions.revokeSession(sessionId);
}
