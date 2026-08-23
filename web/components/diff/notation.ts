// shiki's `// [!code ...]` line notation, as a transformer this repo owns.
//
// WHY THIS FILE EXISTS, WHICH IS NOT A GOOD REASON. `@shikijs/transformers` --
// the package magicui's `code-comparison` imports, and the package the notation
// belongs to -- IS NOT INSTALLED. The shadcn registry emitted a component that
// imports it and added only `shiki` and `next-themes` to `web/package.json`, so
// the base commit does not type-check and `npm run build --workspace web` fails
// on it before anything in this feature is touched. `shiki` itself does not
// carry the transformers: its `exports` map has core, langs, themes, types and
// the two engines, and nothing else.
//
// `package.json` is frozen for this feature (docs/DEV-OWNERSHIP.md), and the
// rule there for a missing dependency is explicit: name it in the report, do
// not install it. So this is thirty lines standing in for a package, and it is
// debt, not a design.
//
// It is written to be DELETED. The notation it reads is shiki's own, the class
// names it emits are shiki's own (`add`, `remove`, `focused`, `highlighted`),
// and the components that render them are written against those names. The day
// `@shikijs/transformers` is added to `web/package.json`, this file is removed
// and `code-comparison.tsx` imports the three real transformers instead --
// nothing else in `web/components/diff/` changes, and no source string does.
//
// The one thing that CANNOT be reproduced here is `matchAlgorithm: "v3"`, which
// is an option on the real transformers and not a behaviour of the notation.
// v3's rule -- a notation comment on a line of its own marks the NEXT line, and
// one at the end of a line marks THAT line -- is what is implemented below,
// because it is the rule the diff strings in this directory are written to.

import type { ShikiTransformer } from 'shiki';

/** `// [!code ++]`, `// [!code --]`, `// [!code focus]`, `// [!code highlight]`. */
const NOTATION = /\s*\/\/\s*\[!code\s+(\+\+|--|focus|highlight)\]\s*$/;

const CLASS_FOR: Record<string, string> = {
  '++': 'add',
  '--': 'remove',
  focus: 'focused',
  highlight: 'highlighted',
};

/**
 * The same code with the markers taken out and nothing marked.
 *
 * For the fallback `<pre>`, which is what every diff on this app paints first:
 * shiki is a WASM-backed grammar engine and cannot run in a server component,
 * so the server renders the source and the browser colours it a moment later.
 * Rendered raw, that first paint showed the reader `// [!code --]` at the end
 * of every changed line -- markup for a highlighter that had not run yet, which
 * is precisely the flash of unstyled text the fallback exists to avoid.
 *
 * A marker alone on its line goes entirely; anything else on the line stays,
 * which is what keeps `// held` beside a withheld cell in the fallback as well
 * as in the highlighted render.
 */
export function stripNotation(code: string): string {
  return code
    .split('\n')
    .flatMap((raw) => {
      if (!NOTATION.test(raw)) return [raw];
      const rest = raw.replace(NOTATION, '');
      return rest.trim() === '' ? [] : [rest];
    })
    .join('\n');
}

/**
 * Strip the notation comments and mark the lines they pointed at.
 *
 * Done in `preprocess` rather than by pre-parsing the string at the call site,
 * because shiki tokenises the code it is GIVEN: leaving the comments in and
 * hiding them with CSS would have the grammar colour them, and stripping them
 * outside the transformer would mean the line numbers counted here and the
 * lines shiki emits could drift apart by one the first time a marker sat on its
 * own line. One pass, one source of truth for the numbering.
 */
export function transformerNotation(): ShikiTransformer {
  // Rebuilt on every `preprocess`, which is the same instance being reused
  // across the two panes of a comparison. Not module-level state: two calls
  // with different code must not see each other's line numbers.
  let marks = new Map<number, string[]>();

  return {
    name: 'assay:notation',
    preprocess(code) {
      marks = new Map();
      const out: string[] = [];
      for (const raw of code.split('\n')) {
        const m = raw.match(NOTATION);
        if (!m) {
          out.push(raw);
          continue;
        }
        const cls = CLASS_FOR[m[1]!]!;
        const rest = raw.replace(NOTATION, '');
        // v3's rule, and it falls out as ONE index rather than two cases.
        // `out.length` is where the next line will land: for a marker after
        // code that is the line about to be pushed, and for a marker alone on
        // its line -- which is dropped entirely -- it is the line below it.
        // Read before the push, so both are the same number.
        const target = out.length;
        if (rest.trim() !== '') out.push(rest);
        marks.set(target, [...(marks.get(target) ?? []), cls]);
      }
      return out.join('\n');
    },
    line(node, line) {
      // `line` is 1-based; `preprocess` counted from 0.
      const cls = marks.get(line - 1);
      if (cls) node.properties.class = ['line', ...cls].join(' ');
      return node;
    },
  };
}
