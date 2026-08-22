// "With no model configured" as a fact, not as a guess about the machine.
//
// The degradation suites used to open with `const noKey = !hasKey()` and skip
// themselves when it was false, which meant the no-key path was tested on a
// laptop with no key and untested everywhere else -- and there was no way to
// tell the two apart from the output. Adding the CLI-login route made that
// worse rather than revealing it: every developer who has ever run
// `claude setup-token` now has a login, so the suites that prove Assay
// degrades quietly would have quietly stopped running.
//
// So the state is imposed instead. Both variables are cleared and the CLI
// probe is stubbed to false, which is the only remaining input to `modelAuth`.
// The tests then run everywhere and mean the same thing everywhere.

import { stubCliProbe } from '../src/ai/model.js';

const NAMES = ['ANTHROPIC_API_KEY', 'CLAUDE_CODE_OAUTH_TOKEN'];

/**
 * Returns the pair to hand to `beforeAll` / `afterAll`. Restores exactly what
 * was there, including "was not set at all", so a suite that runs after this
 * one still sees the developer's real environment.
 */
export function withoutCredentials(): { enter: () => void; leave: () => void } {
  const saved: Record<string, string | undefined> = {};
  return {
    enter() {
      for (const n of NAMES) {
        saved[n] = process.env[n];
        delete process.env[n];
      }
      stubCliProbe(() => false);
    },
    leave() {
      for (const n of NAMES) {
        if (saved[n] === undefined) delete process.env[n];
        else process.env[n] = saved[n];
      }
      // null puts the real probe back and drops the cached answer with it.
      stubCliProbe(null);
    },
  };
}
