// The documentation shell.
//
// `RootProvider` is mounted here rather than in the root layout, which is what
// Fumadocs' own installation page suggests. That advice is written for an app
// that is nothing but documentation; this one is an application with a `/docs`
// route on the side, and no Fumadocs component renders outside this subtree.
// Mounting it at the root would put a second theme provider over every screen
// in Assay for the benefit of six pages.
//
// `theme: { enabled: false }` is the load-bearing option. Fumadocs depends on
// `next-themes` and mounts it by default, which would give this app a second
// theming system: one writing a class onto `<html>` and a value into
// localStorage, and one -- Assay's -- with a single generated palette in
// `tokens.css` and no dark mode at all. Disabled, Fumadocs renders in whatever
// the host app is, which is the correct answer here and stays correct on the
// day `tokens.css` grows a second palette.
//
// `hotKey: false` follows from it. With the provider enabled, pressing `D`
// anywhere in the docs toggles the theme. With it disabled the key would do
// nothing, but the binding is switched off explicitly so that re-enabling
// theming later is a deliberate act rather than a keystroke someone discovers.

import { source } from '@/lib/source';
import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import { RootProvider } from 'fumadocs-ui/provider/next';
import Image from 'next/image';

export default function Layout({ children }: LayoutProps<'/docs'>) {
  return (
    <RootProvider theme={{ enabled: false, hotKey: false }}>
      <DocsLayout
        tree={source.getPageTree()}
        nav={{
          title: (
            <span className="flex items-center gap-[8px]">
              <Image src="/brand/assay-mark.svg" alt="" width={20} height={20} />
              <span className="heading-16 text-[var(--text-primary)]">Assay docs</span>
            </span>
          ),
          url: '/docs',
        }}
        // The theme switch has nothing to switch: see above.
        themeSwitch={{ enabled: false }}
        links={[{ text: 'Open Assay', url: '/', active: 'none' }]}
      >
        {children}
      </DocsLayout>
    </RootProvider>
  );
}
