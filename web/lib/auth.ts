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
 *
 * Server Actions need this too and do not have it yet: they are reachable by
 * POST without going through any route handler, so the proxy is currently their
 * only gate. See the audit note in test/auth.test.ts.
 */
export async function requireOperator(): Promise<Response | null> {
  if (await getCurrentUser()) return null;
  return Response.json(
    { error: 'unauthorized', detail: 'Sign in to use this instance.' },
    { status: 401 },
  );
}
