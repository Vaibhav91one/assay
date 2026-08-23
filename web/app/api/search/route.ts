// The endpoint the docs search dialog has been calling since it was mounted.
//
// `RootProvider` in `app/docs/layout.tsx` mounts Fumadocs' search dialog, and
// that dialog's default client GETs `/api/search?query=...`. There was no such
// route, so every search in the documentation answered 404 -- silently, because
// the dialog renders "no results" for a failed fetch exactly as it does for a
// real miss. A search box that always says "nothing found" is worse than no
// search box, because the reader concludes the page does not exist.
//
// `createFromSource` builds the index from the same `source` the pages and the
// sidebar are built from, so a page cannot be in the navigation and absent from
// search. Indexing happens in this process, in memory, from the MDX that is
// already compiled -- no service, no key, nothing to keep in sync.
//
// NOT under `/api/v1`. That surface is the consumer REST API and every route on
// it requires an `Authorization: Bearer` key; this one serves the public
// documentation to a reader who has not signed in and must not.

import { source } from '@/lib/source';
import { createFromSource } from 'fumadocs-core/search/server';

export const { GET } = createFromSource(source);
