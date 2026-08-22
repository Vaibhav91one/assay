// The one invariant that moved during the TypeScript migration.
//
// `src/fingerprint.ts` used to be the file pasted verbatim into Bright Data's
// Scraper Studio parser, and CONTRIBUTING.md asserted it imported nothing --
// a Cheerio worker has no module loader, so one import breaks it there while
// everything still passes here. TypeScript source cannot be pasted into that
// worker at all, so the rule moves to the emitted artifact:
// `dist/fingerprint.js` is what gets pasted, and it is what must import nothing.
//
// The test builds the artifact rather than reading a committed one. A checked-in
// artifact can go stale against its source and still pass; a rebuilt one cannot.

import { describe, it, expect, beforeAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const artifact = `${root}dist/fingerprint.js`;

let emitted = '';
/** The artifact with comments removed -- the word "import" in prose is not an import. */
let code = '';

beforeAll(() => {
  execFileSync('npm', ['run', '--silent', 'build:fingerprint'], { cwd: root, stdio: 'pipe' });
  emitted = readFileSync(artifact, 'utf8');
  code = emitted.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
});

describe('dist/fingerprint.js -- the Bright Data paste target', () => {
  it('imports nothing', () => {
    expect(code).not.toMatch(/\bimport\b/);
  });

  it('requires nothing', () => {
    expect(code).not.toMatch(/\brequire\s*\(/);
  });

  it('still exports the two functions Scraper Studio calls', () => {
    expect(code).toMatch(/export function fingerprint\b/);
    expect(code).toMatch(/export function skeletonHash\b/);
  });

  it('carries no type annotations -- it has to be plain JS over a Cheerio $', () => {
    // `function fingerprint($: Cheerio, el: El)` surviving emit would mean the
    // build step is copying rather than compiling.
    expect(code).not.toMatch(/:\s*(Cheerio|El|Fingerprint)\b/);
    expect(code).toMatch(/function fingerprint\(\$, el\)/);
  });
});
