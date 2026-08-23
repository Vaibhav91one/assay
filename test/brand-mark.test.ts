// The library's card marks.
//
// Asserted as source text rather than as a rendered component, the same deal
// `test/button-recipe.test.ts` makes and for the same reason: the file is a
// `.tsx` behind Next's path aliases, which this runner does not resolve, and
// the invariants worth protecting are properties of the file anyway.
//
// What actually goes wrong here is a card added to the catalogue and forgotten
// on this screen -- it renders the shelf's default glyph, which is not wrong
// enough to notice and not right enough to help. And, more seriously, a brand
// logo set arriving in `package.json` because it was convenient.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { ALL_TRACKERS } from '../src/connectors/scrapers.js';
import { GROUPS } from '../src/library/index.js';

const src = readFileSync(new URL('../web/components/brand-mark.tsx', import.meta.url), 'utf8');
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const webPkg = JSON.parse(readFileSync(new URL('../web/package.json', import.meta.url), 'utf8'));

/** A `key: Value,` entry anywhere in one of the tables in that file. */
const has = (key: string): boolean => new RegExp(`^\\s+${key}: `, 'm').test(src);

describe('every card on the library screen has a mark of its own', () => {
  it('names every tracker, brand card and page tracker alike', () => {
    // `bd-github` and `github` are one brand and one lookup -- the prefix is
    // dropped before the table is consulted, so the table is keyed without it.
    const missing = ALL_TRACKERS
      .map((t) => (t.id.startsWith('bd-') ? t.id.slice(3) : t.id))
      .filter((key) => !has(key));
    expect(missing).toEqual([]);
  });

  it('has a colour for every shelf, so no card falls through to the default', () => {
    expect(GROUPS.filter((g) => !has(g.id)).map((g) => g.id)).toEqual([]);
  });
});

describe('the category colours come from the design tokens', () => {
  // The whole `CATEGORY` table, which is where every colour on this screen that
  // is not a cleared brand mark comes from.
  const table = src.slice(src.indexOf('const CATEGORY'), src.indexOf('const UNSHELVED'));

  it('is entirely `var(--token)` and carries no literal', () => {
    expect(table).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(table).not.toMatch(/\b(?:rgb|hsl)a?\(/i);
    // Every quoted colour in the table, against every quoted colour that is a
    // bare token reference. The type declaration's `colour: string` is not one
    // of either, which is why both sides look for the quote.
    expect(table.match(/colour: '[^']+'/g)).toEqual(
      table.match(/colour: 'var\(--[a-z-]+\)'/g),
    );
  });

  it('does not spend the retraction red on a category', () => {
    // Red means "published in error" on every other screen. A shelf is not one.
    expect(table).not.toContain('--semantic-danger');
  });
});

describe('no brand-logo set, in either package', () => {
  // TRADEMARKS.md records that 25 of 25 policies were read and none permits
  // redistributing the mark. This is that finding, as a check rather than a
  // paragraph somebody has to remember to read.
  const BANNED = /simple-icons|react-icons|@icons-pack|brandico|font-awesome|@fortawesome/i;

  it('depends on lucide-react and on nothing that ships trademarks', () => {
    for (const p of [pkg, webPkg]) {
      const names = Object.keys({ ...p.dependencies, ...p.devDependencies });
      expect(names.filter((n) => BANNED.test(n))).toEqual([]);
    }
    expect(Object.keys(webPkg.dependencies)).toContain('lucide-react');
  });
});
