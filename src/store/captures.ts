// Content-addressed page storage.
//
// The frozen-page queue card, backfill, blast-radius re-evaluation and unheal
// all need the page a decision was made about. Until now nothing kept one --
// golden_sha256 hashed the extracted *value*, so there was no page to show.
//
// Addressing by digest means an unchanged page is the same filename, so a
// scraper that runs every six hours against a site that changes weekly stores
// one capture, not twenty-eight. Pruning is `rm`.

import { gzipSync, gunzipSync } from 'node:zlib';
import { mkdir, writeFile, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { load } from 'cheerio';
import { digest } from '../runner.js';

export const CAPTURE_DIR = process.env.ASSAY_CAPTURES || 'captures';

const pathFor = (sha: string, dir: string): string => join(dir, `${sha}.html.gz`);

/** What `putCapture` reports back. `deduped` true is the common case. */
export interface StoredCapture {
  sha: string;
  bytes: number;
  deduped: boolean;
}

/**
 * Store a page. Returns { sha, bytes, deduped } -- deduped true when this exact
 * page was already on disk, which is the common case and the whole point.
 */
export async function putCapture(html: string, dir = CAPTURE_DIR): Promise<StoredCapture> {
  const sha = digest(html);
  const file = pathFor(sha, dir);
  try {
    const s = await stat(file);
    return { sha, bytes: s.size, deduped: true };
  } catch {
    // not stored yet
  }
  await mkdir(dir, { recursive: true });
  const gz = gzipSync(Buffer.from(html, 'utf8'));
  await writeFile(file, gz);
  return { sha, bytes: gz.length, deduped: false };
}

/** Read a page back. Throws if the capture was pruned. */
export async function getCapture(sha: string, dir = CAPTURE_DIR): Promise<string> {
  return gunzipSync(await readFile(pathFor(sha, dir))).toString('utf8');
}

/** Is this capture still on disk? Pruned captures are a normal state, not an error. */
export async function hasCapture(sha: string, dir = CAPTURE_DIR): Promise<boolean> {
  try { await stat(pathFor(sha, dir)); return true; } catch { return false; }
}

/**
 * Box one or more candidate elements on a stored capture, server-side.
 *
 * A candidate's selector is `tag.firstClass` (see `src/decisions/index.ts`'s
 * header on why that is NOT positionally unique) -- `$(sel)` can match several
 * elements, so this boxes every match rather than guessing which one the gate
 * meant. Client-side box-drawing would need a postMessage protocol between the
 * page (inert, sandboxed, no scripts) and this app; annotating the markup
 * before it ever reaches the iframe needs none, and keeps `allow-scripts` off
 * the sandbox for good -- this is untrusted third-party HTML.
 *
 * `<base>` is injected so the capture's own relative image/CSS references at
 * least attempt to resolve against the page's original URL rather than
 * against this app's origin; it does nothing for a capture with no known
 * origin, which is fine -- the point of this view is the structure, not a
 * pixel-perfect re-render.
 */
export function annotateCapture(
  html: string,
  candidates: { selector: string; label: string }[],
  baseUrl?: string | null,
): string {
  const $ = load(html);

  // Defense in depth, not the only guard: the iframe this serves into is
  // sandboxed WITHOUT `allow-scripts`, so none of this would execute even
  // left in. It is stripped anyway because "the sandbox attribute is right"
  // is a claim about the caller, and this function has no way to enforce that
  // its caller got the attribute right -- a served response with no script in
  // it is safe regardless.
  $('script').remove();
  $('*').each((_, el) => {
    const attribs = (el as { attribs?: Record<string, string> }).attribs;
    if (!attribs) return;
    for (const name of Object.keys(attribs)) {
      if (name.toLowerCase().startsWith('on')) $(el).removeAttr(name);
    }
    if (attribs.href?.trim().toLowerCase().startsWith('javascript:')) $(el).removeAttr('href');
  });

  if (baseUrl && !$('base').length) $('head').prepend(`<base href="${escapeAttr(baseUrl)}">`);

  const COLORS = ['#f59e0b', '#3b82f6', '#22c55e'];
  candidates.forEach((c, i) => {
    let matched = 0;
    $(c.selector).each((_, el) => {
      matched += 1;
      const color = COLORS[i % COLORS.length];
      const existing = $(el).attr('style') || '';
      $(el).attr(
        'style',
        `${existing}; outline: 3px solid ${color} !important; outline-offset: 2px !important; position: relative !important;`,
      );
      $(el).before(
        `<div style="all: initial; position: relative; display: block; font: 11px/1.4 -apple-system, sans-serif; ` +
        `background: ${color}; color: #fff; padding: 1px 6px; width: fit-content; border-radius: 3px 3px 0 0;">` +
        `${escapeHtml(c.label)}</div>`,
      );
    });
    // Zero matches is not an error here -- a stale selector on an old capture
    // is exactly the case this view exists to show a human, not hide.
    void matched;
  });

  return $.html();
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escapeAttr = (s: string) => escapeHtml(s).replace(/"/g, '&quot;');
