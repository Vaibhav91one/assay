// The retraction CSV, for a browser download rather than a curl of the
// API-key-gated `/api/v1/blast/retraction`. Operator-session, same reasoning
// as `api/conversations/[id]/export/route.ts` -- this is not `/api/v1`, so
// `web/proxy.ts` covers it, and the session is checked again here.

import { blastRadius, retractionCsv, BlastError } from 'assay/engine/blast/index';
import { requireOperator } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ target: string; field: string }> },
): Promise<Response> {
  const denied = await requireOperator();
  if (denied) return denied;

  const { target, field } = await params;
  const atRun = new URL(request.url).searchParams.get('at_run');

  try {
    const window = await blastRadius({
      target: decodeURIComponent(target),
      field: decodeURIComponent(field),
      at_run: atRun ? Number(atRun) : undefined,
    });
    return new Response(await retractionCsv(window), {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition':
          `attachment; filename="${window.target}-${window.field}-${window.first_suspect_run}-${window.detected_run}.csv"`,
        'cache-control': 'no-store',
      },
    });
  } catch (e) {
    if (e instanceof BlastError) return new Response(e.message, { status: 404 });
    throw e;
  }
}
