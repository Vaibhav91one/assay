// RFC 4180, by hand. No library: correct quoting is one regexp and one replace,
// and a dependency here would be a supply chain for eleven lines.
//
// Scraped values are the hostile case, not the edge case -- a recall title
// routinely contains a comma, a quoted product name, or a line break the site
// put there. Every one of those changes the shape of the file if it escapes
// unquoted, so a warehouse silently reads a column that is off by one.

// A field must be quoted if it contains the delimiter, a quote, or either
// half of a line terminator. CR alone counts: old Windows exports still emit it.
const NEEDS_QUOTING = /[",\r\n]/;

/** One CSV field. A quote inside a quoted field is doubled, never escaped. */
export const csvField = (value: string): string =>
  NEEDS_QUOTING.test(value) ? `"${value.replace(/"/g, '""')}"` : value;

/**
 * A CSV document, CRLF-terminated as the RFC requires.
 *
 * `null` is written as an empty field and nothing else -- there is no CSV
 * spelling for "absent", so the caller must carry the distinction in a
 * neighbouring column rather than expect this writer to invent one.
 */
export function toCsv(header: string[], rows: (string | null)[][]): string {
  const line = (cells: (string | null)[]) =>
    cells.map((c) => (c === null ? '' : csvField(c))).join(',');
  return [header, ...rows].map(line).join('\r\n') + '\r\n';
}
