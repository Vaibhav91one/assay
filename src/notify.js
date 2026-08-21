// Email, via Resend.
//
// Two rules from APP-DESIGN 6b, both load-bearing:
//
//   1. The subject carries the withheld count. "12 changes, 2 withheld", never
//      a bare change count -- the subject is the part most people read, so a
//      number that would be a lie in the body is a lie there first.
//   2. One message per break episode per field. The episodes table enforces
//      that upstream; this module only ever sends what it is handed.
//
// The key is read from the environment and never logged. `transport` is a
// parameter so tests prove the shape without sending live mail.

const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

/** "2 changes, 1 withheld" -- never just "2 changes". */
export function digestSubject({ changes, withheld }) {
  return `${plural(changes, 'change')}, ${withheld} withheld`;
}

/** A break names the field and the scraper, so triage happens in the inbox. */
export function breakSubject({ target, field }) {
  return `${target}: ${field} is held`;
}

export function digestBody({ changes = [], withheld = [], unchanged = 0 }) {
  const row = (c) => `<tr><td>${esc(c.target)}</td><td>${esc(c.field)}</td><td>${esc(c.what)}</td></tr>`;
  return `<h2>${esc(digestSubject({ changes: changes.length, withheld: withheld.length }))}</h2>
${changes.length ? `<h3>Changed</h3><table>${changes.map(row).join('')}</table>` : ''}
${withheld.length ? `<h3>Withheld</h3><table>${withheld.map(row).join('')}</table>
<p>A field being held never appears as a change. A hole is not a diff.</p>` : ''}
<p>${unchanged} unchanged.</p>`;
}

export function breakBody({ target, field, diagnosis, rowsHeld = 0, since }) {
  return `<h2>${esc(target)}: I stopped publishing ${esc(field)}.</h2>
<p>${esc(diagnosis)}</p>
<p>${plural(rowsHeld, 'row')} held${since ? ` since run ${esc(since)}` : ''}. Nothing wrong was published.</p>`;
}

/** POST to Resend. Replaced wholesale in tests; never called without a key. */
async function resendTransport({ apiKey, from, to, subject, html, fetchImpl = fetch }) {
  const res = await fetchImpl('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from, to, subject, html }),
  });
  if (!res.ok) throw new Error(`resend ${res.status}`);
  return res.json();
}

/**
 * Send one message. Throws on failure -- the caller decides whether that is
 * fatal, and for a break alert it never is: an undelivered alert falls back to
 * the webhook and is recorded either way.
 */
export async function send({
  to, subject, html,
  apiKey = process.env.ASSAY_RESEND_KEY,
  from = process.env.ASSAY_MAIL_FROM,
  transport = resendTransport,
}) {
  if (!apiKey) throw new Error('ASSAY_RESEND_KEY is not set');
  if (!from) throw new Error('ASSAY_MAIL_FROM is not set');
  if (!to) throw new Error('no recipient');
  return transport({ apiKey, from, to, subject, html });
}
