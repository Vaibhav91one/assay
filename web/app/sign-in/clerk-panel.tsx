'use client';

// The hosted half of `/sign-in`, for real.
//
// `sign-in-form.tsx` (deleted) drew a Figma-matched form but never called
// Clerk -- `requestSignIn()` threw "not wired yet" for every button on this
// panel, always, because writing a from-scratch password + email-verification
// + Google-OAuth + Turnstile-CAPTCHA flow by hand is re-implementing Clerk's
// own `<SignIn/>`, which already does exactly that against this app's real
// instance (verified live: `GET https://intent-coral-2183.clerk.accounts.dev/v1/environment`
// reports `first_factors: [email_code, oauth_google, password, ...]` and
// `captcha_provider: turnstile` -- state a hand-rolled form would have to
// reproduce, not invent).
//
// `<ClerkProvider>` lives here, not at the app root: this is the one screen a
// signed-out visitor reaches, and self-host (AUTH_MODE unset) must never fetch
// Clerk's client JS at all -- same reasoning `lib/auth.ts`'s header gives for
// keeping `@clerk/nextjs` out of the self-hoster's install.
//
// `ClerkProvider`/`SignIn` can be `undefined` here: `next.config.ts` aliases
// the whole package to `false` when it is not installed, so a self-host build
// still compiles even though this file's import is a real, static one (a
// client component's import has to be, to end up in the browser bundle at
// all -- unlike `lib/auth.ts`'s dynamic server-side load). Reachable only if
// an operator sets AUTH_MODE=clerk without running `npm install
// @clerk/nextjs` first, which is the exact case `getCurrentUser()` already
// throws for server-side -- same guidance here, not a blank card.

// @ts-ignore -- optional package; its own .d.ts is absent exactly when the
// webpack alias above kicks in, and `@ts-expect-error` would fail the OTHER
// way (no error to expect) the moment the package is genuinely installed.
import { ClerkProvider, SignIn } from '@clerk/nextjs';

export function ClerkPanel() {
  if (!ClerkProvider || !SignIn) {
    return (
      <p className="body-13_5 text-[var(--text-secondary)]">
        AUTH_MODE=clerk, but @clerk/nextjs is not installed. Run{' '}
        <code className="meta-12_5">npm install @clerk/nextjs</code> and rebuild.
      </p>
    );
  }

  return (
    <ClerkProvider>
      <SignIn routing="path" path="/sign-in" />
    </ClerkProvider>
  );
}
