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
import { digest } from '../runner.js';

export const CAPTURE_DIR = process.env.ASSAY_CAPTURES || 'captures';

const pathFor = (sha, dir) => join(dir, `${sha}.html.gz`);

/**
 * Store a page. Returns { sha, bytes, deduped } -- deduped true when this exact
 * page was already on disk, which is the common case and the whole point.
 */
export async function putCapture(html, dir = CAPTURE_DIR) {
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
export async function getCapture(sha, dir = CAPTURE_DIR) {
  return gunzipSync(await readFile(pathFor(sha, dir))).toString('utf8');
}

/** Is this capture still on disk? Pruned captures are a normal state, not an error. */
export async function hasCapture(sha, dir = CAPTURE_DIR) {
  try { await stat(pathFor(sha, dir)); return true; } catch { return false; }
}
