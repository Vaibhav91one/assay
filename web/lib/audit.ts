// Server-only. Reads one file off disk; touches no database.
//
// The Bright Data snapshot, audited field by field -- the same audit
// `npm run audit` prints, on the same bytes, so the screen and the terminal
// cannot disagree about a number the README quotes.
//
// WHAT THIS IS EVIDENCE OF. `results/j_mt1q17uoq8rkcxd8a.ndjson` is Bright
// Data's unmodified API response for collector `c_mt1nrjboski90goqc`, 60 IKEA
// recall records. The platform reported that run as 100% success, 0 failed
// crawls, and it is right: sixty pages were fetched from a site that fights
// scrapers and none of them failed. This checks the VALUES instead of the HTTP
// status, which is a different question, and it is the question nothing in the
// platform answers. See README.md and docs/HEADTOHEAD.md §5b.
//
// The verdicts and the promised schema are duplicated from `tools/audit.ts`
// rather than imported: that file is a CLI with a `process.exit` and an argv
// parser at module scope, so importing it would run it. The duplication is two
// constants and is pinned by the numbers in README.md, which both produce.

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { detect, robustZ } from 'assay/engine/detect';

/** What the approved Scraper Studio schema said this collector would return. */
const PROMISED = [
  'recall_title', 'recall_url', 'title_on_detail', 'date_published', 'description',
  'product_name', 'hazard', 'remedy', 'image_urls', 'recall_details_url',
] as const;

/** Per-field expectations -- the cheap way to catch "resolved but wrong". */
const EXPECT: Record<string, { regex?: string; minLen?: number }> = {
  recall_title: { regex: '(recall|rappel|retirada|alert)', minLen: 15 },
  title_on_detail: { regex: '(recall|rappel|retirada|alert)', minLen: 15 },
  recall_url: { regex: '^https?://' },
  description: { minLen: 40 },
  remedy: { minLen: 15 },
};

/** The default snapshot, relative to the repo root. */
export const SNAPSHOT = 'results/j_mt1q17uoq8rkcxd8a.ndjson';

export interface FieldAudit {
  field: string;
  /** Records that carried the key at all. `0` means the collector never emitted it. */
  present: number;
  /** Records whose value was not null, empty, or an empty array. */
  nonNull: number;
  /** `1 - nonNull/rows`, as a fraction of every record. */
  nullRate: number;
  verdict: string;
  healthy: boolean;
  /** True when the null rate is a spike against a healthy baseline of zero. */
  spiked: boolean;
}

export interface Audit {
  file: string;
  rows: number;
  fields: FieldAudit[];
  /** Promised fields that are not healthy. The headline counts these. */
  unhealthy: number;
  /** Promised fields no record carried at all. */
  absent: number;
  /** Rows where both halves of the listing/detail cross-check arrived. */
  crossCheck: { comparable: number; agreeing: number } | null;
}

const isNull = (v: unknown): boolean =>
  v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0);

/**
 * Where the snapshot is, from a process whose working directory is not fixed.
 *
 * `next dev` runs from `web/` and `next start web` runs from the repo root, and
 * `web/next.config.ts` carries the scar from the last time something assumed one
 * of those. Both are tried, cheapest first, and a miss is reported as a miss.
 */
async function readSnapshot(file: string): Promise<string | null> {
  for (const base of ['..', '.']) {
    try {
      return await readFile(join(process.cwd(), base, file), 'utf8');
    } catch {
      /* the other one, then nothing */
    }
  }
  return null;
}

/**
 * The audit, or null when the snapshot is not on disk.
 *
 * Null rather than an empty audit: "no fields are unhealthy" and "the file this
 * is read from is not here" are different statements, and the second one must
 * not be able to render as the first.
 */
export async function auditSnapshot(file: string = SNAPSHOT): Promise<Audit | null> {
  const raw = await readSnapshot(file);
  if (raw === null) return null;

  const rows = raw
    .split('\n')
    .filter(Boolean)
    .flatMap((l) => {
      try {
        const v: unknown = JSON.parse(l);
        return v && typeof v === 'object' ? [v as Record<string, unknown>] : [];
      } catch {
        return [];
      }
    });
  if (rows.length === 0) return null;

  const fields: FieldAudit[] = PROMISED.map((field) => {
    const present = rows.filter((r) => field in r).length;
    const nonNull = rows.filter((r) => !isNull(r[field])).length;
    const nullRate = 1 - nonNull / rows.length;

    // A healthy field is what the baseline SHOULD look like. Three clean runs
    // is the comparison, not a claim that three such runs happened.
    const history = [{ nullRate: 0 }, { nullRate: 0 }, { nullRate: 0 }];
    const sample = rows.find((r) => !isNull(r[field]));
    const d = detect({
      field,
      value: sample ? sample[field] : null,
      expected: EXPECT[field] ?? {},
      history,
      skeleton: {},
      anchors: {},
    });

    const verdict =
      present === 0
        ? 'ABSENT — schema promised it, collector never emitted it'
        : nonNull === 0
          ? 'ALL NULL'
          : nullRate > 0.5
            ? `SPARSE — ${(nullRate * 100).toFixed(0)}% null`
            : d.broken
              ? `SUSPECT — ${d.signals.join('; ')}`
              : 'ok';

    return {
      field,
      present,
      nonNull,
      nullRate,
      verdict,
      healthy: verdict === 'ok',
      // The null-rate signal is a property of the whole run, not of one row.
      spiked: robustZ(history.map((h) => h.nullRate), nullRate).spike,
    };
  });

  // The cross-check the whole design depends on: the listing title and the
  // detail-page title are the only independent corroboration between the two
  // stages, and one of them never arrived.
  const comparable = rows.filter(
    (r) => !isNull(r.recall_title) && !isNull(r.title_on_detail),
  ).length;

  return {
    file,
    rows: rows.length,
    fields,
    unhealthy: fields.filter((f) => !f.healthy).length,
    absent: fields.filter((f) => f.present === 0).length,
    crossCheck: comparable
      ? {
          comparable,
          agreeing: rows.filter(
            (r) =>
              !isNull(r.recall_title) &&
              !isNull(r.title_on_detail) &&
              String(r.recall_title).trim() === String(r.title_on_detail).trim(),
          ).length,
        }
      : null,
  };
}
