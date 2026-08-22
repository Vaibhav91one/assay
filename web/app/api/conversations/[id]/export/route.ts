// A conversation as Markdown.
//
// A GET with a filename header rather than a Server Action returning a string
// the client turns into a blob: the browser already knows how to save a
// response, and a plain `<a href>` is a link a person can middle-click, bookmark
// and curl.
//
// Operator-session, not consumer-key: this is under the `web/proxy.ts` matcher
// (it is not `/api/v1`), and the session is checked again here on the resource,
// for the reason `web/app/api/chat/route.ts` sets out -- a matcher is one
// careless edit away from not covering a path.

import { getConversation, toMarkdown } from 'assay/engine/store/conversations';
import { requireOperator } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const denied = await requireOperator();
  if (denied) return denied;

  const { id } = await params;
  if (!/^\d+$/.test(id)) return new Response('Not found', { status: 404 });

  const conversation = await getConversation(Number(id));
  if (!conversation) return new Response('Not found', { status: 404 });

  return new Response(toMarkdown(conversation), {
    headers: {
      'content-type': 'text/markdown; charset=utf-8',
      // The id, not the title. A title is the operator's own text and would
      // have to be escaped for a header, a filesystem and a shell; the
      // conversation's number is already in the document's first lines.
      'content-disposition': `attachment; filename="assay-conversation-${conversation.id}.md"`,
      'cache-control': 'no-store',
    },
  });
}
