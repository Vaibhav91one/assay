// The write path for "what do you want Assay to watch?".
//
// Until now `tools/ingest.ts` was the only code in this repo that inserted a
// target row, and it does it against a fixed corpus with a hard-coded contract.
// The primary action of the first screen had nothing to POST to.
//
// Three rules hold this file up:
//
//   1. THE BASELINE GOES THROUGH `ingestPage`. Not a second run path. A target
//      created here and one created by the CLI have to produce records that
//      differ in nothing but provenance, and the only way to guarantee that is
//      to call the same function -- skip-if-unchanged, proof id, episode, brake
//      and all. `via: 'setup'` rides on the proof record; nothing branches on it.
//
//   2. A RESOLVER PATTERN IS A STRING, NEVER A RegExp. `JSON.stringify(/x/i)`
//      is `{}`, so a literal written into a contract silently becomes an empty
//      object on the way to jsonb and matches nothing on the way back. See the
//      note in `src/target.ts`. The Zod schema below accepts strings only, which
//      is what makes that unrepresentable rather than merely discouraged.
//
//   3. PAUSING IS THE ABSENCE OF A NEXT RUN, not a cadence value. `src/schedule.ts`
//      already says so: a null `next_run_at` is never selected by the due query,
//      so pausing is a property of the data and not a branch in the loop. Writing
//      `cadence = 'paused'` would pause it too -- and destroy the cadence to
//      resume to, which is a silent loss of the operator's own setting.
//
// The logic functions take plain arguments and return plain results, so a Next
// Server Action can call them directly. `src/setup/http.ts` adds Response shapes
// for the machine-to-machine surface and nothing else.

import { z } from 'zod';
import { load } from 'cheerio';
import { inArray } from 'drizzle-orm';
import { readFile, readdir } from 'node:fs/promises';
import { ingestPage, type TargetRow } from '../connectors/ingest.js';
import { nextRunAt, cadenceMs } from '../schedule.js';
import { getDb, targets, eq, sql } from '../store/index.js';

// --- the boundary ------------------------------------------------------------

/**
 * A resolver, as the engine reads it. Mirrors `FieldContract` in src/target.ts.
 *
 * `include`/`exclude` are STRINGS with a separate `flags`, and there is no
 * branch here that would accept a RegExp: rule 2 in the header. `.strict()`
 * because an unrecognised key in a contract is a caller describing a field
 * Assay will not actually look for, and answering 200 to that is a silent
 * fallback wearing a success code.
 */
export const Resolver = z.strictObject({
  tags: z.string().min(1).max(200),
  minLen: z.int().min(0).max(10000),
  maxLen: z.int().min(1).max(10000),
  include: z.string().max(500).nullish(),
  exclude: z.string().max(500).nullish(),
  flags: z.string().regex(/^[dgimsuvy]*$/).max(8).optional(),
}).refine((r) => r.maxLen >= r.minLen, {
  error: 'maxLen must not be below minLen',
  path: ['maxLen'],
});

/** What the detector expects a healthy value to look like. Optional, same string rule. */
export const Expected = z.strictObject({
  regex: z.string().max(500).optional(),
  regexFlags: z.string().regex(/^[dgimsuvy]*$/).max(8).optional(),
  minLen: z.int().min(0).max(10000).optional(),
});

/**
 * A field name. The same shape `src/ai/model.ts` lets a model invent, for the
 * same reason: it becomes a column name and a proof-record key, and a field
 * called `"; DROP` or a 4KB sentence is not a field.
 */
export const FieldName = z.string().regex(/^[a-z][a-z0-9_]{0,30}$/, {
  error: 'a field name is snake_case, starts with a letter, and is at most 31 characters',
});

export const FieldInput = z.strictObject({
  name: FieldName,
  resolver: Resolver,
  expected: Expected.optional(),
  // Settable and deliberately undocumented in the UI: FEATURES.md F2 says a user
  // hand-tuning deltas per field is a user we have failed. The tier vocabulary
  // lives in the field contract (F2), not here.
  thresholds: z.strictObject({
    tau: z.number().min(0).max(1),
    delta: z.number().min(0).max(1),
  }).optional(),
});

/**
 * A cadence the scheduler can actually act on.
 *
 * Validated with `cadenceMs`, not a second regex: two ways of deciding what
 * "6h" means is how the API starts accepting a cadence the worker will never
 * run. `paused` is refused here -- pause is an operation, not a cadence (rule 3).
 */
export const Cadence = z.string().min(1).max(16).refine(
  (c) => c !== 'paused' && cadenceMs(c) != null,
  { error: 'cadence must be hourly, daily, weekly, or a count of hours or days like "6h" or "2d"' },
);

export const CreateInput = z.strictObject({
  url: z.union([z.url(), z.string().regex(/^corpus:\/\/[a-z0-9_-]+$/i)]),
  fields: z.array(FieldInput).min(1).max(12),
  cadence: Cadence.default('6h'),
  /** Override the derived id. Lowercase, so two ids cannot differ only by case. */
  id: z.string().regex(/^[a-z0-9][a-z0-9_.-]{0,62}$/).optional(),
});

export type CreateInput = z.input<typeof CreateInput>;
export type FieldInput = z.infer<typeof FieldInput>;

// --- results -----------------------------------------------------------------

export type SetupError =
  | 'not_found' | 'already_exists' | 'unreachable' | 'no_element' | 'has_history' | 'not_schedulable';

export type Failure = { ok: false; error: SetupError; detail: string };

const fail = (error: SetupError, detail: string): Failure => ({ ok: false, error, detail });

/**
 * Timestamps cross this boundary as ISO strings.
 *
 * `pg` hands back a Date under tsx and a string inside Next's production bundle
 * (WAVE2-LEDGER 5), so a route that returned the column raw would serialise
 * differently in dev and in prod. Normalised here, and an unparseable value
 * THROWS rather than becoming null -- an absence and a broken timestamp are not
 * the same fact.
 */
function iso(v: unknown): string | null {
  if (v == null) return null;
  const d = v instanceof Date ? v : new Date(String(v));
  if (Number.isNaN(d.getTime())) throw new Error(`unparseable timestamp: ${String(v)}`);
  return d.toISOString();
}

export interface TargetView {
  id: string;
  url: string;
  field: string;
  cadence: string;
  /** Pause is the absence of a next run, so this is derived, never stored. */
  paused: boolean;
  next_run_at: string | null;
  created_at: string | null;
  runs: number;
  held: number;
  last_run: number | null;
  last_status: string | null;
}

// --- fetching ----------------------------------------------------------------

/**
 * The page, as bytes.
 *
 * `corpus://site` reads the newest committed capture, exactly as `tools/worker.ts`
 * does, so the setup path is exercisable with no network -- and so a target
 * created here can be compared against one the CLI created from the same page.
 * Four lines rather than an import because worker.ts does not export its copy
 * and is frozen.
 */
async function fetchPage(url: string): Promise<string> {
  if (url.startsWith('corpus://')) {
    const site = url.slice('corpus://'.length).split('/')[0]!;
    // Resolved against the PACKAGE, not the process. `tools/worker.ts` reads
    // `corpus/<site>` relative to cwd, which is the repo root when it runs; a
    // Next route's cwd is `web/`, so the same url would mean two different
    // directories depending on who asked. A corpus url names one page.
    const dir = new URL(`../../corpus/${site}/`, import.meta.url);
    const files = (await readdir(dir)).filter((f) => f.endsWith('.html')).sort();
    if (!files.length) throw new Error(`corpus/${site} holds no captures`);
    return readFile(new URL(files.at(-1)!, dir), 'utf8');
  }
  const res = await fetch(url, { headers: { 'user-agent': 'assay/0.1 (+self-hosted)' } });
  if (!res.ok) throw new Error(`fetch ${res.status}`);
  return res.text();
}

/** `https://www.ikea.com/us/en/recalls/` -> `ikea-com-us-en-recalls`. */
export function slugFor(url: string): string {
  const bare = url
    .replace(/^[a-z0-9+.-]+:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/[?#].*$/, '');
  const slug = bare.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase();
  return slug.slice(0, 48) || 'target';
}

/** One target row per field: the engine watches one field per target today. */
export const targetIdFor = (slug: string, field: string): string => `${slug}__${field}`;

// --- create ------------------------------------------------------------------

export interface Created {
  ok: true;
  id: string;
  url: string;
  cadence: string;
  targets: {
    id: string;
    field: string;
    /** The run the baseline was established on. Went through `ingestPage`. */
    baseline_run: number;
    /** What the page said at baseline, read from the DOM. Never from a model. */
    baseline_value: string | null;
    status: string;
    /**
     * Why the gate settled on that status, as the engine's own code.
     *
     * Carried so a caller rendering a held cell can say what held it instead of
     * saying only that something did. It is a CODE -- `thin_margin`,
     * `below_tau` -- and docs/APP-DESIGN.md 5b rule 5 forbids showing one raw,
     * so a screen must put it through `heldBecause` in `src/reports/vocabulary.ts`
     * rather than printing it. Null when the gate recorded none.
     */
    reason: string | null;
    next_run_at: string | null;
  }[];
}

/**
 * Create a watch: one target row per field, each with its baseline established.
 *
 * The sequence matters. `next_run_at` is left NULL until the baseline lands, so
 * a worker cannot claim a half-built target out from under this function -- the
 * due query skips a null, which is the same property pause relies on.
 *
 * A field whose resolver matches nothing on the page is a REFUSAL, not a target
 * created empty and left to fail on its first scheduled run. The rows written so
 * far are removed; they have no history yet, so removing them loses nothing.
 */
export async function createTarget(input: CreateInput): Promise<Created | Failure> {
  const { url, fields, cadence, id } = CreateInput.parse(input);
  const slug = id ?? slugFor(url);
  const ids = fields.map((f) => targetIdFor(slug, f.name));

  const d = getDb();
  const clash = await d.select({ id: targets.targetId }).from(targets)
    .where(inArray(targets.targetId, ids));
  if (clash.length) {
    return fail(
      'already_exists',
      `Already watching ${clash.map((c) => c.id).join(', ')}. Delete or pause first, or pass a different id.`,
    );
  }

  let html: string;
  try {
    html = await fetchPage(url);
  } catch (e) {
    // The URL is the operator's own input, so the fetch failure is theirs to
    // see. It names no internal detail: `fetch 404` is the whole of it.
    return fail('unreachable', `Could not read ${url}: ${(e as Error).message}`);
  }

  // Every field is checked against the page BEFORE anything is written, so a
  // three-field watch with one bad resolver writes nothing at all.
  const $ = load(html);
  $('script,style,noscript').remove();
  const missing = fields.filter((f) => !pick($, f.resolver)).map((f) => f.name);
  if (missing.length) {
    return fail(
      'no_element',
      `Nothing on ${url} matches the contract for ${missing.join(', ')}. `
        + 'Assay will not start watching a field it cannot see once.',
    );
  }

  await d.insert(targets).values(fields.map((f, i) => ({
    targetId: ids[i]!,
    url,
    cadence,
    contract: {
      field: f.name,
      resolver: f.resolver,
      ...(f.expected ? { expected: f.expected } : {}),
      ...(f.thresholds ? { thresholds: f.thresholds } : {}),
    },
    nextRunAt: null,
  })));

  const out: Created['targets'] = [];
  try {
    for (let i = 0; i < fields.length; i++) {
      const row: TargetRow = { targetId: ids[i]!, url, contract: null };
      const [t] = await d.select().from(targets).where(eq(targets.targetId, ids[i]!)).limit(1);
      row.contract = t!.contract;
      // The shared run path. Not a copy of it.
      const r = await ingestPage({ target: row, html, via: 'setup' });
      out.push({
        id: ids[i]!,
        field: fields[i]!.name,
        baseline_run: r.runId,
        baseline_value: r.result?.publishedValue ?? null,
        status: r.result?.status.status ?? 'skipped',
        reason: r.result?.status.reason ?? null,
        next_run_at: null,
      });
    }
  } catch (e) {
    // Half a watch is worse than none: the operator would see a page under watch
    // with a field silently missing from it. Unwind and say what happened.
    await removeRows(ids);
    return fail('no_element', `Could not establish a baseline on ${url}: ${(e as Error).message}`);
  }

  const due = nextRunAt(cadence);
  await d.update(targets).set({ nextRunAt: due }).where(inArray(targets.targetId, ids));
  const dueIso = iso(due);

  return {
    ok: true,
    id: slug,
    url,
    cadence,
    targets: out.map((t) => ({ ...t, next_run_at: dueIso })),
  };
}

/**
 * First element satisfying a resolver -- the same walk `pickTarget` does.
 *
 * Duplicated deliberately rather than imported: `src/target.ts` compiles a
 * pattern with `new RegExp` and a caller-supplied `flags`, and calling it here
 * on unvalidated input would surface a regex syntax error as a 500. This runs
 * over the already-parsed contract and answers a boolean question.
 */
// TODO(types): `$` is a CheerioAPI and elements are domhandler Elements, which
// src/target.ts deliberately leaves unnamed. Same compromise, same reason.
function pick($: any, r: z.infer<typeof Resolver>): boolean {
  let found = false;
  let bad = false;
  const compile = (p: string | null | undefined) => {
    if (p == null) return null;
    try { return new RegExp(p, r.flags ?? 'i'); } catch { bad = true; return null; }
  };
  const include = compile(r.include);
  const exclude = compile(r.exclude);
  if (bad) return false;
  $(r.tags).each((_: number, el: any) => {
    if (found) return;
    const t = ($(el).text() || '').replace(/\s+/g, ' ').trim();
    if (t.length < r.minLen || t.length > r.maxLen) return;
    if (include && !include.test(t)) return;
    if (exclude && exclude.test(t)) return;
    found = true;
  });
  return found;
}

// --- read --------------------------------------------------------------------

const VIEW = sql`
  SELECT t.target_id, t.url, t.cadence, t.contract, t.next_run_at, t.created_at,
         count(r.run_id)::int AS runs,
         count(fr.proof_id) FILTER (WHERE fr.status = 'quarantined')::int AS held,
         max(r.run_id)::int AS last_run
  FROM targets t
  LEFT JOIN runs r ON r.target_id = t.target_id
  LEFT JOIN field_runs fr ON fr.run_id = r.run_id`;

// TODO(types): drizzle's `execute` hands back `Record<string, unknown>`, so the
// shape is named here rather than inferred. Same as `src/store/index.ts`.
type Row = Record<string, any>;

const view = (r: Row, lastStatus: string | null): TargetView => ({
  id: r.target_id,
  url: r.url,
  field: (r.contract as Row)?.field ?? null,
  cadence: r.cadence,
  paused: r.next_run_at == null,
  next_run_at: iso(r.next_run_at),
  created_at: iso(r.created_at),
  runs: r.runs ?? 0,
  held: r.held ?? 0,
  last_run: r.last_run ?? null,
  last_status: lastStatus,
});

async function lastStatusFor(runId: number | null): Promise<string | null> {
  if (runId == null) return null;
  const { rows } = await getDb().execute(
    sql`SELECT status FROM runs WHERE run_id = ${runId} LIMIT 1`,
  );
  return (rows as Row[])[0]?.status ?? null;
}

/** Everything under watch, newest first. */
export async function listTargets(): Promise<{ ok: true; targets: TargetView[] }> {
  const { rows } = await getDb().execute(
    sql`${VIEW} GROUP BY t.target_id ORDER BY t.created_at DESC`,
  );
  const out: TargetView[] = [];
  for (const r of rows as Row[]) out.push(view(r, await lastStatusFor(r.last_run)));
  return { ok: true, targets: out };
}

/** One target, or a refusal. Never an empty object standing in for a missing one. */
export async function showTarget(id: string): Promise<{ ok: true; target: TargetView } | Failure> {
  const { rows } = await getDb().execute(
    sql`${VIEW} WHERE t.target_id = ${id} GROUP BY t.target_id`,
  );
  const r = (rows as Row[])[0];
  if (!r) return fail('not_found', `Nothing under watch with the id ${id}.`);
  return { ok: true, target: view(r, await lastStatusFor(r.last_run)) };
}

// --- pause, resume -----------------------------------------------------------

export type Paused = { ok: true; id: string; paused: boolean; cadence: string; next_run_at: string | null };

/**
 * Stop running a target without forgetting how often it ran.
 *
 * `next_run_at = NULL`, and the cadence column is left exactly as the operator
 * set it. Writing `cadence = 'paused'` would also pause it, and would destroy
 * the setting resume has to restore -- a silent loss of the operator's own
 * input, on the one operation whose entire purpose is that it is reversible.
 *
 * Idempotent: pausing a paused target is not an error, it is the state the
 * caller asked for.
 */
export async function pauseTarget(id: string): Promise<Paused | Failure> {
  const [t] = await getDb().update(targets).set({ nextRunAt: null })
    .where(eq(targets.targetId, id))
    .returning({ id: targets.targetId, cadence: targets.cadence });
  if (!t) return fail('not_found', `Nothing under watch with the id ${id}.`);
  return { ok: true, id: t.id, paused: true, cadence: t.cadence, next_run_at: null };
}

/**
 * Put a target back in the due query, at once.
 *
 * `now`, not `now + cadence`: a target that has been paused for a week has
 * missed every run in it, and making the operator wait another six hours to see
 * whether the page still resolves is the opposite of what they asked for.
 *
 * A cadence the scheduler cannot act on is refused rather than resumed into a
 * target that would never run again. `cadence` is validated on the way in, so
 * this only fires on a row written before this file existed.
 */
export async function resumeTarget(id: string): Promise<Paused | Failure> {
  const d = getDb();
  const [t] = await d.select({ cadence: targets.cadence }).from(targets)
    .where(eq(targets.targetId, id)).limit(1);
  if (!t) return fail('not_found', `Nothing under watch with the id ${id}.`);
  if (cadenceMs(t.cadence) == null) {
    return fail(
      'not_schedulable',
      `${id} has the cadence "${t.cadence}", which names no interval. Set a cadence before resuming.`,
    );
  }
  const at = new Date();
  await d.update(targets).set({ nextRunAt: at }).where(eq(targets.targetId, id));
  return { ok: true, id, paused: false, cadence: t.cadence, next_run_at: iso(at) };
}

// --- delete ------------------------------------------------------------------

async function removeRows(ids: string[]): Promise<void> {
  await getDb().delete(targets).where(inArray(targets.targetId, ids));
}

export type Deleted = { ok: true; id: string; deleted: true };

/**
 * Forget a target that never ran. Refuse one that did.
 *
 * THE DECISION, stated once so nobody has to infer it: **a target with history
 * is not deletable.** Every published row carries a proof id and F12 promises
 * that id still answers "where did this number come from?" months later. Rows
 * are already in somebody's warehouse; deleting the runs behind them would turn
 * a working proof id into a 404 and there is no way to tell that reader that
 * the answer was destroyed rather than never recorded.
 *
 * So delete is scoped to what it can honestly destroy: a target created by
 * mistake, before its first run. Everything else pauses -- which stops the
 * scraping, keeps the history, and is reversible. The refusal says so.
 *
 * This is the same shape as F9's rule that a correction is a new version rather
 * than a mutation in place, and A's rule that undo is a column rather than a
 * delete. Nothing in this product removes evidence.
 */
export async function deleteTarget(id: string): Promise<Deleted | Failure> {
  const d = getDb();
  const { rows } = await d.execute(sql`
    SELECT count(*)::int AS runs,
           count(*) FILTER (WHERE fr.status = 'quarantined')::int AS held
    FROM runs r LEFT JOIN field_runs fr ON fr.run_id = r.run_id
    WHERE r.target_id = ${id}`);
  const counts = (rows as Row[])[0]!;

  const [t] = await d.select({ id: targets.targetId }).from(targets)
    .where(eq(targets.targetId, id)).limit(1);
  if (!t) return fail('not_found', `Nothing under watch with the id ${id}.`);

  if (counts.runs > 0) {
    const held = counts.held > 0 ? ` ${counts.held} of them is still held for you.` : '';
    return fail(
      'has_history',
      `${id} has ${counts.runs} run(s) on record.${held} Deleting them would break the proof id `
        + 'on every row already published from this page. Pause it instead -- that stops the '
        + 'scraping, keeps the history, and can be undone.',
    );
  }

  await removeRows([id]);
  return { ok: true, id, deleted: true };
}
