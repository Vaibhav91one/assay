'use server';

import { z } from 'zod';
import { authMode } from '@/lib/auth';

/** What the form can come back as. A closed set, like every other vocabulary
 *  in this codebase -- there is no "something went wrong" member. */
export type SignInState = { step: 'form' } | { step: 'unknown'; email: string };

const Submission = z.object({ email: z.string().email() });

/**
 * Ask for a sign-in link.
 *
 * On a self-hosted instance there are no accounts at all -- `lib/auth.ts`
 * returns one frozen OPERATOR and never consults a user table -- so every
 * address really is unrecognised, and saying so is the truth rather than a
 * stub. That is the state the design already writes copy for.
 *
 * Hosted (AUTH_MODE=clerk) is deliberately NOT wired here. That provider's
 * email-link flow runs client-side, and naming its package in a component
 * would break the one rule that keeps self-host and hosted from becoming two
 * codebases -- lib/auth.ts is the only module allowed to know, and
 * test/auth.test.ts greps for exactly that. Sending our own magic links
 * instead would mean hand-rolling authentication, which is not a corner worth
 * cutting to make a button light up.
 */
export async function requestSignIn(
  _prev: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const parsed = Submission.safeParse({ email: formData.get('email') });

  // An address we cannot parse is an address we do not recognise. Same answer,
  // and it gives away nothing about who does have an account.
  if (!parsed.success) {
    return { step: 'unknown', email: String(formData.get('email') ?? '') };
  }

  if (authMode() === 'clerk') {
    throw new Error(
      'AUTH_MODE=clerk, but the hosted sign-in flow is not wired yet. ' +
        'Run single-operator (unset AUTH_MODE) until it is.',
    );
  }

  return { step: 'unknown', email: parsed.data.email };
}
