// One page, two panels. Which one you get is not a new setting -- it is the
// question `lib/auth.ts` already answers for every other guard in the app:
// does this deployment have accounts?
//
//   authMode() === 'clerk' -> there are accounts, so sign in.
//   authMode() === 'none'  -> there is one operator and no user table, so the
//                             email form could never succeed. Ask for keys.
//
// The left half is identical either way, which is why `chrome.tsx` exists.

import type { Metadata } from 'next';
import { authMode } from '@/lib/auth';
import { CardHalf, Headline } from './chrome';
import { KeyPanel } from './key-panel';
import { SignInForm } from './sign-in-form';

// Not static. This page now reads the environment twice -- `authMode()` picks
// the panel, and the panel reports which keys are present -- and Next would
// otherwise prerender it at build time and bake both in. A self-hoster runs an
// image someone else built: the answer has to be computed on the machine that
// has the environment, not the machine that had it. (Measured, not assumed:
// the build listed `/sign-in` as `○ (Static)` before this line.)
export const dynamic = 'force-dynamic';

export const generateMetadata = (): Metadata => ({
  title: authMode() === 'clerk' ? 'Sign in · Assay' : 'Configure your key · Assay',
});

export default function SignInPage() {
  return (
    <main className="flex min-h-screen items-stretch bg-[var(--bg-page)]">
      <Headline />
      <CardHalf>{authMode() === 'clerk' ? <SignInForm /> : <KeyPanel />}</CardHalf>
    </main>
  );
}
