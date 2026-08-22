// The documentation links on Settings point at headings that exist.
//
// A "See documentation" button is a promise, and it is the kind of promise that
// breaks without anyone touching the button: someone renames a heading in
// `web/content/docs/credentials.mdx`, the anchor stops resolving, and the
// control still looks exactly like a control while landing the operator at the
// top of a page they now have to search. That is precisely the failure the
// per-credential deep links were introduced to end -- see the sign-in panel's
// note about "four buttons on one page" -- so it is asserted rather than
// trusted.
//
// `test/signin-keys.test.ts` already checks the SHAPE of its hrefs
// (`/^\/docs\/[a-z-]+#[a-z-]+$/`). That assertion is untouched and still worth
// having; this one is the other half, and it needs the file on disk rather than
// a regex. Both maps are checked here because both render the same button.

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { KINDS } from '../src/connectors/config.js';
import { CONNECTOR_DOC, MODEL_DOC } from '../web/app/(app)/settings/docs.js';
import { readKeys } from '../web/app/sign-in/keys.js';

const ROOT = new URL('../', import.meta.url).pathname;

/**
 * The slug fumadocs gives a heading: lowercased, punctuation dropped, spaces
 * hyphenated. "Bright Data" -> "bright-data".
 */
const slug = (heading: string): string =>
  heading
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-');

/** Every anchor `/docs/<page>` offers, read off the .mdx that becomes it. */
function anchors(page: string): string[] {
  const file = join(ROOT, 'web', 'content', 'docs', `${page}.mdx`);
  expect(existsSync(file), `no such doc page: ${page}`).toBe(true);
  return [...readFileSync(file, 'utf8').matchAll(/^#{2,6}\s+(.+)$/gm)].map((m) => slug(m[1]));
}

describe('the documentation buttons on Settings', () => {
  const links = [
    ['model access', MODEL_DOC] as const,
    ...KINDS.map((k) => [k, CONNECTOR_DOC[k]] as const),
    ...readKeys('none').map((k) => [k.name, k.doc] as const),
  ];

  it('covers every connector, so a new kind cannot ship with no href', () => {
    // The type already makes this a build error; the assertion is here so the
    // failure says which connector rather than which line of tsc.
    for (const k of KINDS) expect(CONNECTOR_DOC[k], `${k} has no documentation`).toBeTruthy();
  });

  it('lands each one on a heading that is actually in the page', () => {
    for (const [name, href] of links) {
      const [, page, hash] = href.match(/^\/docs\/([a-z-]+)#(.+)$/) ?? [];
      expect(page, `${name}: ${href} is not a deep link into /docs`).toBeTruthy();
      expect(anchors(page!), `${name}: #${hash} is not a heading in ${page}.mdx`).toContain(hash);
    }
  });
});
