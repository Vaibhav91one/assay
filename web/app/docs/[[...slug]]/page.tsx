// One documentation page.
//
// Static. `generateStaticParams` enumerates every page in `content/docs`, so
// each one is HTML at build time -- including its Mermaid diagrams, which are
// server components and therefore markup rather than a client render. Nothing
// on these pages reads the environment or the database, which is the whole
// reason they can be prerendered while `/sign-in` cannot.

import { source } from '@/lib/source';
import { DocsBody, DocsDescription, DocsPage, DocsTitle } from 'fumadocs-ui/layouts/docs/page';
import { createRelativeLink } from 'fumadocs-ui/mdx';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getMDXComponents } from '@/components/mdx';

export default async function Page(props: PageProps<'/docs/[[...slug]]'>) {
  const params = await props.params;
  const page = source.getPage(params.slug);
  if (!page) notFound();

  const MDX = page.data.body;

  return (
    <DocsPage toc={page.data.toc} full={page.data.full}>
      <DocsTitle>{page.data.title}</DocsTitle>
      <DocsDescription>{page.data.description}</DocsDescription>
      <DocsBody>
        {/* `createRelativeLink` lets a page link to `./credentials.mdx` and get
            `/docs/credentials`, so a cross-reference is checked by the file
            existing rather than by someone remembering the URL. */}
        <MDX components={getMDXComponents({ a: createRelativeLink(source, page) })} />
      </DocsBody>
    </DocsPage>
  );
}

export function generateStaticParams() {
  return source.generateParams();
}

export async function generateMetadata(
  props: PageProps<'/docs/[[...slug]]'>,
): Promise<Metadata> {
  const params = await props.params;
  const page = source.getPage(params.slug);
  if (!page) notFound();

  return {
    title: `${page.data.title} · Assay`,
    description: page.data.description,
  };
}
