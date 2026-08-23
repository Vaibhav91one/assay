// One field's history, as CSV.
//
// OPERATOR SESSION, NOT CONSUMER KEY. This sits under `(app)`, alongside the
// pages, so it is the same surface the Fields screen is -- `requireOperator()`,
// the route-handler half of the guard `assertOperator()` gives the server
// actions. It is deliberately NOT `/api/v1`, which is the key-authenticated
// surface a customer's warehouse pulls from. The session is checked here on the
// resource rather than left to `web/proxy.ts`, for the reason the conversation
// export route sets out: a matcher is one careless edit away from not covering
// a path.
//
// THE HOLES ARE IN THE FILE. A withheld run is a row with an empty value cell
// and its reason code in the next column -- not a dropped row, and never the
// previous value carried forward. That is the entire difference between this
// export and a healer's, and an export that quietly closed the gaps would be
// the product lying in the one format people actually load into a warehouse.

import { targetHistory } from '@/lib/fields';
import { requireOperator } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const LIMIT = 30;
const HEAD = ['run_id', 'at', 'target_id', 'field', 'status', 'value', 'held_reason', 'proof_id'];

/**
 * RFC 4180 quoting, and it is not optional here.
 *
 * A scraped value is untrusted text that routinely contains commas, quotes and
 * newlines -- a product title with a comma in it would silently shift every
 * later column of that row. Everything is quoted rather than only what looks
 * dangerous: one rule has no edge case to get wrong.
 */
const cell = (v: string | number | null): string =>
  v === null ? '""' : `"${String(v).replaceAll('"', '""')}"`;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ target: string }> },
): Promise<Response> {
  const denied = await requireOperator();
  if (denied) return denied;

  const { target } = await params;
  const id = decodeURIComponent(target);
  const history = await targetHistory(id, LIMIT);
  if (history.rows.length === 0) return new Response('Not found', { status: 404 });

  const body = [
    HEAD.join(','),
    ...history.rows.map((r) =>
      [
        cell(r.runId),
        cell(r.at ? r.at.toISOString() : null),
        cell(history.targetId),
        cell(r.field),
        cell(r.status),
        // The hole, as an empty cell. Its neighbour says which refusal it was.
        cell(r.value),
        cell(r.reason),
        cell(r.proof),
      ].join(','),
    ),
  ].join('\r\n');

  return new Response(`${body}\r\n`, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      // The target id, which `src/setup` already constrains to
      // `[a-z0-9_.-]` plus the `__` separator -- so there is nothing in it
      // that needs escaping for a header, a filesystem or a shell.
      'content-disposition': `attachment; filename="assay-${history.targetId}.csv"`,
      'cache-control': 'no-store',
    },
  });
}
