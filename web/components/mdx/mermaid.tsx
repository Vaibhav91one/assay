// A diagram, drawn on the server.
//
// NO `'use client'`, AND THAT IS THE POINT. Fumadocs documents two Mermaid
// renderers. The first is mermaid.js itself, which needs a DOM: it can only run
// in the browser, so the component has to render nothing at all until it has
// mounted and then swap in an SVG. That is a hole in the page that fills in
// after hydration -- the layout shifts, and a slow client sees an empty frame
// where the architecture diagram should be.
//
// `beautiful-mermaid` has no DOM dependency, so this is an async server
// component: the SVG is markup by the time the HTML leaves the server, it is
// inside the prerendered output of a static route, and there is no client
// JavaScript and no flash of anything. The cost is coverage -- it is a
// reimplementation, not mermaid.js, and it draws flowchart, state, sequence,
// class, ER and XY charts. Anything else throws, which is what the `catch` is
// for: a diagram that cannot be drawn falls back to its own source, which is
// still the most useful thing to show someone.
//
// THEMING. The colours are passed as `var(...)` strings rather than as hex,
// and the library writes them out as CSS custom properties on the `<svg>`
// element rather than baking them into every `fill` and `stroke`. So a diagram
// is coloured by the same cascade as the rest of the app: it reads Assay's
// tokens, it needs no second palette, and it would follow a light/dark change
// without re-rendering, because nothing about it is decided in JavaScript.
//
// The tokens are Assay's own, not Fumadocs'. `--color-fd-*` are mapped onto
// these in `app/fumadocs.css`, so going through them would be an alias for the
// same values with one more hop to get wrong.

import { CodeBlock, Pre } from 'fumadocs-ui/components/codeblock';
import { renderMermaidSVG } from 'beautiful-mermaid';

export async function Mermaid({ chart }: { chart: string }) {
  try {
    const svg = renderMermaidSVG(chart, {
      // `bg` and `fg` are required and everything else is derived from them by
      // `color-mix()`. The four below are supplied anyway so that a node border
      // is Assay's hairline and an emphasised edge is Assay's brand orange,
      // rather than a computed approximation of either.
      bg: 'var(--surface-card)',
      fg: 'var(--text-primary)',
      line: 'var(--text-secondary)',
      accent: 'var(--accent-brand)',
      muted: 'var(--text-muted)',
      surface: 'var(--surface-subtle)',
      border: 'var(--border-default)',
      // The page ground shows through, so a diagram sits on whatever surface it
      // was placed on instead of carrying a rectangle of its own.
      transparent: true,
    });

    return (
      <div
        className="my-[24px] overflow-x-auto rounded-[var(--radius-card)] border border-[var(--border-hairline)] bg-[var(--surface-subtle)] p-[20px] [&>svg]:mx-auto [&>svg]:h-auto [&>svg]:max-w-full"
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    );
  } catch {
    // Not an empty box and not a thrown build. The source of a diagram is
    // readable, and a reader who can see it can tell us what failed to draw.
    return (
      <CodeBlock title="Mermaid — this diagram could not be drawn">
        <Pre>{chart}</Pre>
      </CodeBlock>
    );
  }
}
