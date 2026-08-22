// The button recipe, asserted as source text rather than as a rendered
// component.
//
// `web/components/button.tsx` imports `@/lib/utils` and `@/components/motion`,
// which are Next path aliases this runner does not resolve, so importing it
// here would mean teaching vitest about the web tsconfig for one test. The
// invariants worth protecting are textual anyway: that there is exactly ONE
// declaration of the outlined control, and that no variant can ship without
// the motion the design system promises. Both are properties of the file, and
// both are what actually regressed before -- the same control shipped with
// four different paddings, and `press-` was on some buttons and not others.
//
// This fails the moment someone hand-rolls the outlined recipe again in a
// screen instead of reaching for the variant, which is the only moment worth
// failing at.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const WEB = new URL('../web/', import.meta.url).pathname;
const RECIPE = readFileSync(join(WEB, 'components/button.tsx'), 'utf8');

/** Every .tsx/.ts under web/, minus the build output. */
function sources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.next') continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) sources(path, out);
    else if (name.endsWith('.tsx') || name.endsWith('.ts')) out.push(path);
  }
  return out;
}

/** The canonical outlined control: the value the drift was reconciled onto. */
const OUTLINED = 'py-[8px] pl-[12px] pr-[14px]';

describe('the outlined control has one home', () => {
  it('declares the canonical padding in components/button.tsx', () => {
    expect(RECIPE).toContain(OUTLINED);
  });

  it('is not hand-rolled anywhere else in web/', () => {
    const offenders = sources(WEB)
      .filter((f) => !f.endsWith('components/button.tsx'))
      .filter((f) => readFileSync(f, 'utf8').includes(OUTLINED))
      .map((f) => f.slice(WEB.length));

    expect(offenders).toEqual([]);
  });

  it('has no copy of the four paddings it replaced', () => {
    // `pl-[11px]`/`pr-[13px]` were unique to the drifted "Check again" button.
    // The file's own prose quotes them, so it is excluded rather than matched.
    const retired = ['pl-[11px]', 'pr-[13px]'];
    const offenders = sources(WEB)
      .filter((f) => !f.endsWith('components/button.tsx'))
      .filter((f) => {
        const src = readFileSync(f, 'utf8');
        return retired.some((r) => src.includes(r));
      })
      .map((f) => f.slice(WEB.length));

    expect(offenders).toEqual([]);
  });
});

describe('no variant can ship without its motion', () => {
  // Pulled out of the cva block by name so a variant added later is covered
  // without this test being edited -- which is the only way it stays true.
  const variants = [...RECIPE.matchAll(/^\s{8}(\w+):\s*$|^\s{8}(\w+):\n?\s*'/gm)]
    .map((m) => m[1] ?? m[2])
    .filter(Boolean);

  it('finds every variant the recipe declares', () => {
    expect(variants.sort()).toEqual(
      ['chip', 'icon', 'link', 'outline', 'primary', 'quiet', 'success'].sort(),
    );
  });

  it('gives each one a press class', () => {
    // Split on the variant keys so each variant's own class string is checked,
    // not merely the presence of `press-` somewhere in the file.
    for (const v of variants) {
      const start = RECIPE.indexOf(`        ${v}:`);
      const rest = RECIPE.slice(start);
      const decl = rest.slice(0, rest.indexOf("',") + 1);
      expect(decl, `${v} has no press- class`).toMatch(/press-(icon|row|wide)/);
    }
  });

  it('puts the focus ring and the hover tint in the base, not in a variant', () => {
    const base = RECIPE.slice(0, RECIPE.indexOf('variants: {'));
    expect(base).toContain('focus-visible:outline-[var(--semantic-link)]');
    expect(base).toContain('duration-[var(--duration-tint)]');
    expect(base).toContain('disabled:opacity-60');
  });
});
