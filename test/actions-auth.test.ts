// Every Server Action refuses an anonymous caller on the hosted deployment.
//
// WHY THIS TEST EXISTS AS A CALL AND NOT A GREP. A Server Action is reachable by
// POST to the page's own url with an action id. It goes through no route
// handler, so `web/proxy.ts` was its only gate -- and Next documents a proxy as
// an OPTIMISTIC check, not authorisation. An audit demonstrated the consequence:
// with AUTH_MODE=clerk and no session, an anonymous same-origin POST of
// `resolveCell` reached the database and was answered from it.
//
// A grep for `assertOperator` would pass on an action that imports the guard and
// forgets to await it. So every exported action in the four files is IMPORTED
// AND CALLED here with arguments that would otherwise reach the store, and the
// assertion is on which error came back: `Unauthorized` means the guard answered
// first, and anything else -- a driver error, a validation message, a success --
// means it did not.
//
// The four modules are listed by hand rather than globbed. A new action file is
// meant to be a decision someone makes about this list.

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

// The hosted deployment's auth package is deliberately NOT a dependency (see
// web/lib/auth.ts), so there is nothing on disk to mock -- the factory IS the
// module. `auth()` answering `{ userId: null }` is exactly a signed-out visitor
// on a hosted instance, which is the case that was open.
vi.mock('@clerk/nextjs/server', () => ({ auth: async () => ({ userId: null }) }));

const saved = process.env.AUTH_MODE;
beforeAll(() => { process.env.AUTH_MODE = 'clerk'; });
afterAll(() => {
  if (saved === undefined) delete process.env.AUTH_MODE;
  else process.env.AUTH_MODE = saved;
});

const decisions = () => import('../web/app/(app)/decisions/actions.js');
const schedule = () => import('../web/app/(app)/schedule/actions.js');
const settings = () => import('../web/app/(app)/settings/actions.js');
const watch = () => import('../web/app/(app)/watch-actions.js');

/** Every exported action, with arguments that would otherwise reach the store. */
const ACTIONS: [string, () => Promise<unknown>][] = [
  // The one an audit actually reached the database with.
  ['decisions.resolveCell', async () => (await decisions()).resolveCell('proof-1', 'accept-new')],
  ['decisions.undoCell', async () => (await decisions()).undoCell('proof-1')],
  ['schedule.askForRun', async () => (await schedule()).askForRun('some-slug')],
  ['schedule.landedSince',
    async () => (await schedule()).landedSince('some-slug', new Date().toISOString())],
  ['settings.setDigest', async () => (await settings()).setDigest(true)],
  ['settings.recheckModelAccess', async () => (await settings()).recheckModelAccess()],
  ['watch.sources', async () => (await watch()).sources()],
  ['watch.ask', async () => (await watch()).ask('watch this page', [])],
  ['watch.openConversation', async () => (await watch()).openConversation('watch this page')],
  ['watch.recordTurns', async () => (await watch()).recordTurns(1, [])],
  ['watch.build',
    async () => (await watch()).build({ url: 'https://example.com/', cadence: 'daily', fields: [] }, [])],
  ['watch.describeFields', async () => (await watch()).describeFields({
    url: 'https://example.com/', cadence: 'daily', fields: [{ name: 'price', example: '10' }],
  })],
];

describe('AUTH_MODE=clerk, no session', () => {
  it('found every action to check', () => {
    // The list is hand-written, so it can rot by omission. This is the reminder.
    expect(ACTIONS.length).toBe(12);
  });

  it.each(ACTIONS)('%s refuses before touching the store', async (name, call) => {
    const { Unauthorized } = await import('../web/lib/auth.js');
    const err = await call().then(
      (value) => ({ kind: 'returned' as const, value }),
      (e: Error) => ({ kind: 'threw' as const, value: e }),
    );

    expect(err.kind, `${name} answered an anonymous caller instead of refusing`).toBe('threw');
    // Specifically the guard. A store error here would mean the action ran and
    // merely happened to fail, which is not the property being asserted.
    expect(err.value, `${name} failed for a reason other than authorisation`)
      .toBeInstanceOf(Unauthorized);
  });
});

describe('self-host is untouched', () => {
  // The guard's job is to make HOSTED correct. Self-host has no accounts, no
  // sign-in and no signed-out state -- `getCurrentUser()` returns the single
  // operator and never null. If this ever fails, the security fix has become a
  // wall across the product for the deployment that has nobody to check.
  it('AUTH_MODE unset lets the operator through', async () => {
    const before = process.env.AUTH_MODE;
    delete process.env.AUTH_MODE;
    try {
      const { assertOperator, authMode } = await import('../web/lib/auth.js');
      expect(authMode()).toBe('none');
      await expect(assertOperator()).resolves.toBeUndefined();
    } finally {
      process.env.AUTH_MODE = before;
    }
  });
});
