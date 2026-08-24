// The consent screen. Every real "grant a client access" moment in the
// product happens here and nowhere else -- `src/api/oauth.ts` never mints a
// key on its own, only in response to `actions.ts`'s `approveClient`, which
// only runs for a signed-in operator (self-host: the only operator there is;
// hosted: whoever `proxy.ts` already required a session for before this page
// ever rendered).
//
// Reachable only via a real OAuth authorize request -- `assay_client`,
// `assay_redirect`, `assay_challenge` are read straight off the query string
// a real MCP client (claude.ai, chiefly) constructs, not typed by a person.
// An operator who lands here with a bad or tampered link sees why, not a
// silent redirect to somewhere they did not choose.

import { getClient } from 'assay/api/oauth';
import { actionVariants } from '@/components/button';
import { approveClient, denyClient } from './actions';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Authorize · Assay' };

export default async function AuthorizePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const clientId = params.client_id ?? '';
  const redirectUri = params.redirect_uri ?? '';
  const codeChallenge = params.code_challenge ?? '';
  const codeChallengeMethod = params.code_challenge_method ?? '';
  const responseType = params.response_type ?? '';
  const state = params.state ?? '';
  const resource = params.resource ?? '';

  const client = clientId ? await getClient(clientId) : null;
  const problem =
    responseType !== 'code' ? 'response_type must be "code".'
    : codeChallengeMethod !== 'S256' ? 'code_challenge_method must be "S256".'
    : !codeChallenge ? 'Missing code_challenge (PKCE is required).'
    : !client ? 'Unknown client_id. This client has not registered with Assay.'
    : !client.redirectUris.includes(redirectUri) ? 'redirect_uri does not match what this client registered.'
    : null;

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--bg-page)] p-[24px]">
      <div className="flex w-full max-w-[440px] flex-col gap-[20px] rounded-[16px] border border-[var(--border-default)] bg-[var(--surface-card)] p-[32px] shadow-elevation-floating">
        <h1 className="display-28 text-[var(--text-primary)]">Authorize access</h1>

        {problem ? (
          <p className="body-14 text-[var(--semantic-danger)]">{problem}</p>
        ) : (
          <>
            <p className="body-14 text-[var(--text-secondary)]">
              <span className="text-[var(--text-primary)]">
                {client!.clientName ?? client!.clientId}
              </span>{' '}
              wants to connect to your Assay instance. It will be able to read and act on
              everything an API key can -- runs, decisions, blast-radius, incidents, digests.
            </p>
            <p className="meta-12_5 text-[var(--text-muted)]">
              Redirects to <span className="text-[var(--text-secondary)]">{new URL(redirectUri).host}</span> when
              you decide.
            </p>

            <div className="flex gap-[12px]">
              <form action={approveClient} className="flex-1">
                <input type="hidden" name="client_id" value={clientId} />
                <input type="hidden" name="redirect_uri" value={redirectUri} />
                <input type="hidden" name="code_challenge" value={codeChallenge} />
                <input type="hidden" name="state" value={state} />
                <input type="hidden" name="resource" value={resource} />
                <button type="submit" className={`${actionVariants({ variant: 'primary' })} w-full`}>
                  Approve
                </button>
              </form>
              <form action={denyClient} className="flex-1">
                <input type="hidden" name="client_id" value={clientId} />
                <input type="hidden" name="redirect_uri" value={redirectUri} />
                <input type="hidden" name="code_challenge" value={codeChallenge} />
                <input type="hidden" name="state" value={state} />
                <input type="hidden" name="resource" value={resource} />
                <button type="submit" className={`${actionVariants({ variant: 'outline' })} w-full`}>
                  Deny
                </button>
              </form>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
