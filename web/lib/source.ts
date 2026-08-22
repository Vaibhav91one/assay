// The documentation tree, loaded from `content/docs`.
//
// SERVER ONLY, and not by convention. This module reaches the generated MDX
// entry files, which reach `node:fs`. A `'use client'` component that imports
// it -- directly, or through a barrel that re-exports it -- puts `fs` in the
// browser graph, and the build fails with `Can't resolve 'fs'`. That is the
// canonical way this package breaks an existing app, so: `app/docs/layout.tsx`
// and `app/docs/[[...slug]]/page.tsx` import it, and nothing else does.

import { defineDocs } from 'fumadocs-mdx/macro';
import { loader } from 'fumadocs-core/source';

const docs = defineDocs({
  dir: 'content/docs',
});

export const source = loader({
  baseUrl: '/docs',
  source: docs.toFumadocsSource(),
});
