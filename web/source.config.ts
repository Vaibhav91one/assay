// Fumadocs MDX configuration.
//
// The macro API in `lib/source.ts` is enough on its own and needs no file here.
// This one exists for a single line: `remarkMdxMermaid`, which turns a fenced
// ```mermaid block into `<Mermaid chart="..." />`. Without it every diagram in
// `content/docs` has to be written as JSX with the graph escaped inside a
// string attribute, which is not a diagram you can read in the source or diff
// in a review -- and a diagram you can diff is the reason this repo draws them
// as code at all.

import { defineConfig } from 'fumadocs-mdx/config';
import { remarkMdxMermaid } from 'fumadocs-core/mdx-plugins';

export default defineConfig({
  mdxOptions: {
    remarkPlugins: [remarkMdxMermaid],
  },
});
