'use client';

import { useCallback, useRef, useState } from 'react';
import Link from 'next/link';
import { Hammer } from 'lucide-react';
import { Button } from '@/components/button';
import { breakPage, type Broken } from '@/app/(app)/runs/[run]/break-actions';
import { landedSince, type Landed } from '@/app/(app)/schedule/actions';
import { t } from '@/lib/copy';

/**
 * "Break this page", for a scraper that watches the testbed.
 *
 * A DEMO CONTROL AND NOTHING MORE. It appears only where `ASSAY_TESTBED` is set
 * and the run's scraper already points at that host, which is one target in a
 * development database; it is invisible on every real install. The refusals live
 * in `break-actions.ts`, not here -- this is a picker, a button, and a report of
 * what came back.
 *
 * The wait is `landedSince`, the same watch the Schedule screen uses. It reads
 * the run RECORD rather than a timer, so "no worker is consuming this queue"
 * arrives as the finished answer it is instead of as a spinner that never ends.
 * That is the whole reason it is imported rather than re-implemented: a second
 * copy of this loop would drift, and the first thing to drift would be the
 * wording of a refusal.
 */

/** The same numbers `run-now.tsx` watches with. A poll, not a promise. */
const WATCH_MS = 45_000;
const EVERY_MS = 2_000;

export interface Variant {
  id: string;
  label: string;
  /** `target` | `none` | `ambiguous` -- what a correct answer looks like here. */
  expect: string;
}

type Phase =
  | { kind: 'idle' }
  | { kind: 'breaking' }
  | { kind: 'refused'; detail: string }
  | { kind: 'watching'; broken: Broken }
  | { kind: 'settled'; broken: Broken; landed: Landed; timedOut: boolean };

export function BreakLive({ slug, variants }: { slug: string; variants: Variant[] }) {
  const [variant, setVariant] = useState(variants[0]?.id ?? 'baseline');
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const go = useCallback(async () => {
    setPhase({ kind: 'breaking' });
    const broken = await breakPage(slug, variant);
    if (!broken.ok || !broken.since) {
      setPhase({ kind: 'refused', detail: broken.detail });
      return;
    }
    setPhase({ kind: 'watching', broken });

    const since = broken.since;
    const deadline = Date.now() + WATCH_MS;
    const tick = async () => {
      const landed = await landedSince(slug, since);
      if (landed.runs.length > 0 || Date.now() >= deadline) {
        setPhase({ kind: 'settled', broken, landed, timedOut: landed.runs.length === 0 });
        return;
      }
      timers.current.push(setTimeout(tick, EVERY_MS));
    };
    timers.current.push(setTimeout(tick, EVERY_MS));
  }, [slug, variant]);

  const busy = phase.kind === 'breaking' || phase.kind === 'watching';

  return (
    <div className="flex flex-col gap-[10px] rounded-[var(--radius-card)] border border-[var(--border-default)] bg-[var(--surface-card)] p-[20px]">
      <p className="meta-12_5 max-w-[720px] text-[var(--text-secondary)]">
        {t('break.explain')} <span className="mono-value-12_5">baseline</span>{' '}
        {t('break.explain.after')}
      </p>
      <div className="flex flex-wrap items-center gap-[10px]">
        <select
          value={variant}
          onChange={(e) => setVariant(e.target.value)}
          disabled={busy}
          aria-label={t('break.pick')}
          className="focus-ring mono-value-12_5 rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--surface-card)] px-[10px] py-[7px] text-[var(--text-primary)]"
        >
          {variants.map((v) => (
            <option key={v.id} value={v.id}>
              {v.id} — {v.label}
            </option>
          ))}
        </select>
        <Button variant="outline" icon={Hammer} loading={busy} onClick={go}>
          {t('break.button')}
        </Button>
      </div>
      <Said phase={phase} />
    </div>
  );
}

/** What actually happened. Never a spinner on its own. */
function Said({ phase }: { phase: Phase }) {
  if (phase.kind === 'idle' || phase.kind === 'breaking') return null;

  if (phase.kind === 'refused') {
    return (
      <p role="alert" className="caption-11 text-[var(--semantic-warning)]">
        {phase.detail}
      </p>
    );
  }

  if (phase.kind === 'watching') {
    return (
      <p className="caption-11 text-[var(--text-secondary)]">
        {phase.broken.detail} {t('break.watching')}
      </p>
    );
  }

  const { broken, landed, timedOut } = phase;

  if (landed.runs.length === 0) {
    return (
      <p role="alert" className="caption-11 text-[var(--semantic-warning)]">
        {broken.detail} {timedOut ? t('break.timedOut') : ''}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-[4px]">
      {landed.runs.map((r) => (
        <p key={`${r.run}:${r.field ?? ''}`} className="caption-11 text-[var(--text-secondary)]">
          <Link href={`/runs/${r.run}`} className="mono-value-12_5 text-[var(--semantic-link)] hover:underline">
            run {r.run}
          </Link>
          {r.field ? <> · {r.field}</> : null} · {r.status === 'quarantined' ? t('run.cell.held') : r.status}
          {r.reason ? <> · <span className="mono-value-12_5">{r.reason}</span></> : null}
        </p>
      ))}
    </div>
  );
}
