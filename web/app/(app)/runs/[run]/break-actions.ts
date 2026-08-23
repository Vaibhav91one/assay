'use server';

// Break the page on purpose, and watch the gate answer.
//
// The demo control. Assay's argument is "the page changed and I refused to
// guess", and until now the only way to see that happen was to wait for a real
// site to redesign itself. The testbed serves the SAME page mutated nine ways at
// `/v/<mutation_id>/` -- the pre-registered mutations in `src/mutate.ts`, the
// ones `docs/HEADTOHEAD.md` §5a is measured against -- so pointing a watched
// target at one of them is a redesign, on demand, with known ground truth.
//
// THIS FILE STILL DOES NOT SCRAPE, and nothing here bypasses the machinery that
// refuses to. It repoints one target's url and then calls `askForRun` -- the
// same server action the Schedule screen and the top bar call, carrying the same
// paused-scraper refusal and the same worker-liveness sentence read off a
// Postgres advisory lock. If nothing is consuming the queue, this says so in
// those words rather than inventing gentler ones.
//
// THE URL WRITE IS THE ONE DANGEROUS THING HERE, so it is fenced twice. The
// control does not exist unless `ASSAY_TESTBED` is set, and the write refuses
// unless every target row under the scraper already points at that host. A
// scraper watching somebody's real site can never be repointed by this button,
// whatever slug is posted to it. The variant is checked against `MUTATIONS`
// rather than interpolated, so nothing a caller sends reaches a url or a row.
//
// It is a persistent write, not a one-shot override, because there is nowhere
// to put a one-shot: the worker reads `targets.url` when it claims the job, and
// a run "against a different url just this once" would need a column that does
// not exist. So the target stays on the variant until someone picks another --
// `baseline` is in the list, and is how you put it back. The UI says this.

import { inArray } from 'drizzle-orm';
import { getDb } from 'assay/store';
import * as schema from 'assay/engine/store/schema';
import { MUTATIONS } from 'assay/engine/mutate';
import { assertOperator } from '@/lib/auth';
import { askForRun, type Asked } from '../../schedule/actions';

/** The unmutated page. Not a mutation, so it is not in `MUTATIONS`. */
const BASELINE = 'baseline';

export interface Broken {
  ok: boolean;
  /** What happened, in the product's voice. Carries `askForRun`'s refusal verbatim. */
  detail: string;
  /** Where to start looking for what lands. Null when nothing was queued. */
  since: string | null;
}

/**
 * The testbed origin, normalised, or null when there is no testbed.
 *
 * `tools/selfheal.ts` defaults an unset variable to the public deployment. This
 * deliberately does not: a control that rewrites a target's url must not appear
 * because of a fallback nobody configured.
 */
function testbed(): URL | null {
  const raw = process.env.ASSAY_TESTBED;
  if (!raw) return null;
  try {
    return new URL(raw.replace(/\/$/, ''));
  } catch {
    return null;
  }
}

/** Same host, or not the testbed. Anything unparseable is not the testbed. */
function onTestbed(url: string | null, base: URL): boolean {
  if (!url) return false;
  try {
    return new URL(url).host === base.host;
  } catch {
    return false;
  }
}

/**
 * Every variant this control offers, for the picker.
 *
 * Read off `MUTATIONS` rather than off the testbed's index page, which is what
 * `tools/selfheal.ts` does. That tool is a measurement and must exercise
 * whatever is actually deployed; this is a button, and a network fetch on every
 * render of a run page to populate a dropdown is a cost paid by every reader who
 * never opens it. A variant listed here that the testbed does not serve fails
 * loudly at fetch time, in the run record, which is where a wrong url should
 * show up anyway.
 */
export async function breakVariants(): Promise<{ id: string; label: string; expect: string }[]> {
  await assertOperator();
  return [
    { id: BASELINE, label: 'baseline — put it back', expect: 'target' },
    ...MUTATIONS.map((m) => ({ id: m.id, label: m.label, expect: m.expect })),
  ];
}

/**
 * Point this scraper at one mutation of the testbed page, then ask for a run.
 *
 * Refuses rather than half-succeeds: if any target row under the slug is not on
 * the testbed host, nothing is written at all.
 */
export async function breakPage(slug: string, variant: string): Promise<Broken> {
  await assertOperator();

  const base = testbed();
  if (!base) {
    return { ok: false, since: null, detail: 'ASSAY_TESTBED is not set, so there is no testbed to break.' };
  }
  if (variant !== BASELINE && !MUTATIONS.some((m) => m.id === variant)) {
    return { ok: false, since: null, detail: `No mutation called ${variant}.` };
  }

  const db = getDb();
  const rows = (await db
    .select({ id: schema.targets.targetId, url: schema.targets.url })
    .from(schema.targets)).filter((r) => r.id.split('__')[0] === slug);

  if (rows.length === 0) {
    return { ok: false, since: null, detail: `Nothing under watch called ${slug}.` };
  }
  // Every row, not most of them. A scraper with one field on the testbed and one
  // on a real site is not a testbed scraper, and half-repointing it would be the
  // silent partial write this product exists to complain about.
  if (!rows.every((r) => onTestbed(r.url, base))) {
    return {
      ok: false,
      since: null,
      detail: `${slug} does not point at ${base.host}, so this control will not rewrite its url.`,
    };
  }

  const url = `${base.origin}${base.pathname === '/' ? '' : base.pathname}/v/${variant}/`;
  await db
    .update(schema.targets)
    .set({ url })
    .where(inArray(schema.targets.targetId, rows.map((r) => r.id)));

  const asked: Asked = await askForRun(slug);
  return {
    ok: asked.ok,
    since: asked.ok ? asked.since : null,
    detail: `${slug} now reads ${url}. ${asked.detail}`,
  };
}
