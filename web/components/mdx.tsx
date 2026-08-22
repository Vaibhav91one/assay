// What an MDX page in `content/docs` is allowed to render.
//
// Fumadocs' defaults, plus the two things this repo adds: a server-rendered
// Mermaid diagram, and the product marks. Nothing here is a client component,
// so a documentation page ships no JavaScript it did not ask for.

import defaultMdxComponents from 'fumadocs-ui/mdx';
import type { MDXComponents } from 'mdx/types';
// `Tabs`/`Tab` are NOT in `defaultMdxComponents` -- a page using them compiles
// and then fails at prerender with "Expected component `Tab` to be defined",
// which is a build error rather than a broken page, but only because every
// documentation page here is statically generated.
import { Tab, Tabs } from 'fumadocs-ui/components/tabs';
import { Mermaid } from '@/components/mdx/mermaid';
import { Mark, Marks } from '@/components/mdx/mark';

export function getMDXComponents(components?: MDXComponents) {
  return {
    ...defaultMdxComponents,
    Tabs,
    Tab,
    // `remarkMdxMermaid` in `source.config.ts` rewrites every ```mermaid fence
    // into this, so a page author writes a fence and never this tag.
    Mermaid,
    Mark,
    Marks,
    ...components,
  } satisfies MDXComponents;
}
