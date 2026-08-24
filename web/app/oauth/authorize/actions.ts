'use server';

// The one moment an operator's session actually authorises something else --
// every other Server Action in this app answers to a browser tab the
// operator is looking at; this one, on approval, hands a durable API key to
// a THIRD PARTY (claude.ai, or whoever registered `clientId`). `assertOperator()`
// first, same as every action file, but the stakes of skipping it here are
// the highest in the product: an anonymous POST here would mint a working
// key for an attacker-chosen client.
//
// Every field is re-validated against the stored client row, not trusted
// from the hidden form fields `page.tsx` rendered -- a POST here does not
// have to have come from that page's own form.

import { redirect } from 'next/navigation';
import { assertOperator } from '@/lib/auth';
import { getClient, createAuthCode } from 'assay/api/oauth';

async function validated(formData: FormData) {
  const clientId = String(formData.get('client_id') ?? '');
  const redirectUri = String(formData.get('redirect_uri') ?? '');
  const codeChallenge = String(formData.get('code_challenge') ?? '');
  const state = formData.get('state');
  const resource = formData.get('resource');

  const client = await getClient(clientId);
  if (!client || !client.redirectUris.includes(redirectUri) || !codeChallenge) return null;
  return {
    clientId,
    redirectUri,
    codeChallenge,
    state: typeof state === 'string' ? state : null,
    resource: typeof resource === 'string' ? resource : null,
  };
}

/** The redirect target on denial (RFC6749 §4.1.2.1) -- the client's own URI, told the user said no. */
function denialUrl(redirectUri: string, state: string | null): string {
  const url = new URL(redirectUri);
  url.searchParams.set('error', 'access_denied');
  if (state) url.searchParams.set('state', state);
  return url.toString();
}

export async function approveClient(formData: FormData): Promise<void> {
  await assertOperator();
  const input = await validated(formData);
  // Nothing safe to redirect to -- the redirect_uri itself failed
  // validation, so this throws rather than sending anyone anywhere.
  if (!input) throw new Error('Unknown client or unregistered redirect_uri.');

  const code = await createAuthCode(input);
  const url = new URL(input.redirectUri);
  url.searchParams.set('code', code);
  if (input.state) url.searchParams.set('state', input.state);
  redirect(url.toString());
}

export async function denyClient(formData: FormData): Promise<void> {
  await assertOperator();
  const input = await validated(formData);
  if (!input) throw new Error('Unknown client or unregistered redirect_uri.');
  redirect(denialUrl(input.redirectUri, input.state));
}
