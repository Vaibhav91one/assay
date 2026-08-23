'use client';

// magicui's `code-comparison`, adapted. Four things changed and each is a
// decision rather than a tidy-up, so each is written down where it happened.
//
// 1. NO `next-themes`. Upstream reads `useTheme()` and picks between a light
//    and a dark shiki theme. This app HAS one theme -- `tokens.css` is a single
//    palette generated from Figma, `web/app/fumadocs.css` says in as many words
//    that there is no `.dark` block, no `prefers-color-scheme` query and no
//    `data-theme` attribute, and the rail is dark ON a light page rather than a
//    surface that inverts. So there is no theme to read, and adding a provider
//    to a root layout so one component could ask a question with one possible
//    answer is the wrong trade. One `theme` prop, defaulted, and the whole
//    dark/light branch is gone. If the app ever grows a second theme this
//    becomes one `useContext` here and nothing else moves.
//
// 2. `@shikijs/transformers` IS NOT INSTALLED -- see the header of
//    `../diff/notation.ts`, which stands in for it and says why it should not
//    have to. Upstream's arrangement was wrong either way: it lazy-loads
//    `shiki` and then imports two of its three transformers statically at
//    module scope, dragging the transformer package into the main client chunk
//    to be used only after the lazy load has already happened. The local
//    replacement is a type-only import at module scope, which costs the bundle
//    nothing, and shiki itself stays behind the same `await`.
//
// 3. shadcn's default token names (`bg-background`, `border-border`,
//    `bg-accent`) are replaced with the generated ones. `shadcn-bridge.css`
//    would have made the originals resolve, but it exists so a shadcn component
//    can be dropped in unedited -- this one is edited, and a file that names
//    `--surface-card` is a file whose colour can be found by searching for it.
//
// 4. Hand-rolled `duration-300` is replaced by the motion system. 300ms IS
//    `--duration-reveal`, but this is a highlight travelling across lines,
//    which docs/MOTION.md gives `--duration-glide`; the numbers are close and
//    the roles are not, and the role is the thing that has to survive someone
//    retuning the scale.
//
// One thing is deleted rather than adapted: the `VS` chip upstream floats over
// the seam between the panes. Both panes are already labelled, and a badge that
// says two things are being compared, on top of two things being compared, is
// the duplicated fact docs/APP-DESIGN.md 5b calls P2.
//
// The fallback `<pre>` matters more here than upstream treats it. Highlighting
// is client-side by necessity -- shiki is a WASM-backed grammar engine and does
// not run in a server component -- so the first paint of every diff on this app
// is the unhighlighted branch. It is styled as real code in the app's own mono
// face rather than left to inherit, so what lands is plain code that then gains
// colour, not a flash of unstyled text.

import { useEffect, useState } from 'react';
import { FileIcon } from 'lucide-react';

import { stripNotation, transformerNotation } from '@/components/diff/notation';
import { cn } from '@/lib/utils';

interface CodeComparisonProps {
  beforeCode: string;
  afterCode: string;
  language: string;
  filename: string;
  /** Right-hand label. Upstream hard-coded `before`/`after`; a schema diff wants run ids. */
  beforeLabel?: string;
  afterLabel?: string;
  /**
   * A shiki theme name. One, not two -- see note 1. `github-light` is the
   * closest bundled theme to `tokens.css`: near-black text on white, and no
   * background of its own that has to be argued with.
   */
  theme?: string;
  /**
   * The band behind a `// [!code highlight]` line. Defaulted to the warning
   * surface because the one thing this app highlights is a withheld cell, and
   * that colour is the same one `/compare` and the run page's field table
   * already draw a held cell in.
   */
  highlightColor?: string;
}

export function CodeComparison({
  beforeCode,
  afterCode,
  language,
  filename,
  beforeLabel = 'before',
  afterLabel = 'after',
  theme = 'github-light',
  highlightColor = 'var(--semantic-warning-subtle)',
}: CodeComparisonProps) {
  const [highlightedBefore, setHighlightedBefore] = useState('');
  const [highlightedAfter, setHighlightedAfter] = useState('');

  // Whether either side used `// [!code focus]`. Read off the rendered HTML
  // rather than off the source, because the transformer is what decides
  // whether a notation matched -- `matchAlgorithm: "v3"` is stricter than the
  // default about which line a trailing comment attaches to, and guessing from
  // the source would dim every line on a diff whose notation did not take.
  const hasLeftFocus = highlightedBefore.includes('class="line focused"');
  const hasRightFocus = highlightedAfter.includes('class="line focused"');

  useEffect(() => {
    let live = true;
    async function highlightCode() {
      try {
        const { codeToHtml } = await import('shiki');
        // One transformer instance per pane, never one shared between them: it
        // holds the line numbers it stripped out of the code it was given, and
        // the two panes are different code.
        const [before, after] = await Promise.all([
          codeToHtml(beforeCode, {
            lang: language, theme, transformers: [transformerNotation()],
          }),
          codeToHtml(afterCode, {
            lang: language, theme, transformers: [transformerNotation()],
          }),
        ]);
        if (!live) return;
        setHighlightedBefore(before);
        setHighlightedAfter(after);
      } catch (error) {
        // Leaving both empty keeps the fallback `<pre>` on screen, which is
        // the code, legibly, in the app's mono face. Upstream sets
        // `<pre>${code}</pre>` here as raw HTML, which is both unstyled AND an
        // injection of unescaped page text into `dangerouslySetInnerHTML`.
        console.error('Error highlighting code:', error);
      }
    }
    highlightCode();
    return () => {
      live = false;
    };
  }, [beforeCode, afterCode, language, theme]);

  const renderCode = (code: string, highlighted: string) => {
    if (!highlighted) {
      return (
        <pre className="mono-value-12_5 h-full overflow-auto bg-[var(--surface-card)] p-[16px] text-[var(--text-primary)]">
          {stripNotation(code)}
        </pre>
      );
    }
    return (
      <div
        style={{ '--highlight-color': highlightColor } as React.CSSProperties}
        className={cn(
          'mono-value-12_5 h-full w-full overflow-auto bg-[var(--surface-card)]',
          // shiki writes the theme's own background onto the `<pre>` inline.
          // Left alone it paints a second, slightly different white over the
          // card and the two edges show.
          '[&>pre]:h-full [&>pre]:w-full [&>pre]:!bg-transparent [&>pre]:py-[8px]',
          '[&>pre>code]:inline-block! [&>pre>code]:w-full!',
          '[&>pre>code>span]:inline-block! [&>pre>code>span]:w-full [&>pre>code>span]:px-[16px] [&>pre>code>span]:py-[1px]',
          '[&>pre>code>.highlighted]:inline-block [&>pre>code>.highlighted]:w-full [&>pre>code>.highlighted]:bg-(--highlight-color)!',
          // The two diff bands, on the app's own semantic surfaces rather than
          // upstream's hard-coded emerald and rose.
          '[&>pre>code>.add]:bg-[var(--semantic-success-subtle)] [&>pre>code>.remove]:bg-[var(--semantic-danger-subtle)]',
          'group-hover/left:[&>pre>code>:not(.focused)]:opacity-100! group-hover/left:[&>pre>code>:not(.focused)]:blur-none!',
          'group-hover/right:[&>pre>code>:not(.focused)]:opacity-100! group-hover/right:[&>pre>code>:not(.focused)]:blur-none!',
          'group-hover/left:[&>pre>code>:not(.focused)]:transition-all group-hover/left:[&>pre>code>:not(.focused)]:duration-[var(--duration-glide)] group-hover/left:[&>pre>code>:not(.focused)]:ease-[var(--ease-glide)]',
          'group-hover/right:[&>pre>code>:not(.focused)]:transition-all group-hover/right:[&>pre>code>:not(.focused)]:duration-[var(--duration-glide)] group-hover/right:[&>pre>code>:not(.focused)]:ease-[var(--ease-glide)]',
        )}
        dangerouslySetInnerHTML={{ __html: highlighted }}
      />
    );
  };

  const pane = (
    side: 'left' | 'right',
    label: string,
    code: string,
    highlighted: string,
    dim: boolean,
  ) => (
    <div
      className={cn(
        side === 'left'
          ? 'group/left border-[var(--border-hairline)] md:border-r'
          : 'group/right border-t border-[var(--border-hairline)] md:border-t-0',
        dim &&
          '[&>div>pre>code>:not(.focused)]:opacity-50! [&>div>pre>code>:not(.focused)]:blur-[0.095rem]!',
        '[&>div>pre>code>:not(.focused)]:transition-all [&>div>pre>code>:not(.focused)]:duration-[var(--duration-glide)] [&>div>pre>code>:not(.focused)]:ease-[var(--ease-glide)]',
      )}
    >
      <div className="meta-12_5 flex items-center gap-[8px] border-b border-[var(--border-hairline)] bg-[var(--surface-subtle)] px-[16px] py-[8px] text-[var(--text-secondary)]">
        <FileIcon size={14} strokeWidth={1.5} aria-hidden />
        <span className="mono-label-12 text-[var(--text-primary)]">{filename}</span>
        <span className="ml-auto">{label}</span>
      </div>
      {renderCode(code, highlighted)}
    </div>
  );

  return (
    <div className="w-full">
      <div className="group relative w-full overflow-hidden rounded-[var(--radius-card)] border border-[var(--border-default)]">
        <div className="relative grid md:grid-cols-2">
          {pane('left', beforeLabel, beforeCode, highlightedBefore, hasLeftFocus)}
          {pane('right', afterLabel, afterCode, highlightedAfter, hasRightFocus)}
        </div>
      </div>
    </div>
  );
}
