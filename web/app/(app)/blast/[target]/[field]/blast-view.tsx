'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { Download } from 'lucide-react';
import { StatusLine } from '@/components/status-line';
import { actionVariants } from '@/components/button';
import type { BlastWindow, RescrapeItem } from 'assay/engine/blast/index';
import { fileRetraction } from './actions';
import { stamp } from '@/lib/when';
import { t } from '@/lib/copy';

/**
 * F6/F9 on screen: the window a field's current value is suspect across, the
 * rows inside it, and the two actions F9 offers -- file the retraction, and
 * take the list of pages that need a fresh read to replace it.
 *
 * No "Anchors died" / "Shape mismatch" category split here, unlike the Figma
 * frame: `BlastWindow` does not classify WHY a row is suspect, only THAT it
 * is, and inventing a category the backend never computed would be exactly
 * the kind of unmeasured claim `figma-conformance.js`'s `selfNarration` rule
 * exists to catch elsewhere on this board. What's below is everything the
 * window actually carries.
 */
export function BlastView({
  target,
  field,
  window: w,
  rescrape,
}: {
  target: string;
  field: string;
  window: BlastWindow;
  rescrape: RescrapeItem[];
}) {
  const [pending, start] = useTransition();
  const [filed, setFiled] = useState<{ retractionId: number; rows: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const csvHref = `/api/blast/${encodeURIComponent(target)}/${encodeURIComponent(field)}/retraction.csv?at_run=${w.detected_run}`;

  const onFile = () => start(async () => {
    setError(null);
    const r = await fileRetraction(target, field, w.detected_run);
    if (r.ok) setFiled({ retractionId: r.retractionId, rows: r.rows });
    else setError(r.detail);
  });

  return (
    <div className="flex flex-col gap-[28px] p-[24px]">
      <section className="flex flex-col gap-[12px] rounded-[var(--radius-card)] border border-[var(--border-default)] bg-[var(--surface-card)] p-[24px]">
        <p className="label-10 text-[var(--text-muted)]">WHAT THIS COVERS</p>
        <div className="flex flex-wrap gap-x-[40px] gap-y-[14px]">
          <Stat n={w.rows.length} label="suspect rows" />
          <Stat n={w.suspect_runs.length} label="runs affected" />
          <Stat n={w.withheld_runs.length} label="held, nothing to retract" />
          <div className="flex flex-col gap-[2px]">
            <p className="title-20 text-[var(--text-primary)]">
              {w.last_clean_run ?? '—'} → {w.detected_run}
            </p>
            <p className="caption-12 text-[var(--text-muted)]">last clean run → detected</p>
          </div>
        </div>
        {!w.bounded && (
          <StatusLine tone="warning" size={13} type="caption-12">
            This count is a floor, not a total — see the notes below.
          </StatusLine>
        )}
      </section>

      {w.caveats.length > 0 && (
        <section className="flex flex-col gap-[8px]">
          <p className="label-10 text-[var(--text-muted)]">NOTES</p>
          <ul className="flex flex-col gap-[6px]">
            {w.caveats.map((c, i) => (
              <li key={i} className="meta-13 text-[var(--text-secondary)]">{c}</li>
            ))}
          </ul>
        </section>
      )}

      <section className="flex flex-wrap items-center gap-[12px]">
        <button
          type="button"
          disabled={pending || w.rows.length === 0 || filed !== null}
          onClick={onFile}
          className={actionVariants({ variant: 'primary' })}
        >
          {filed ? `Filed — retraction #${filed.retractionId}` : 'File retraction'}
        </button>
        <a href={csvHref} className={actionVariants({ variant: 'outline' })}>
          <Download size={14} strokeWidth={1.5} aria-hidden />
          Export retraction CSV
        </a>
        {error && <StatusLine tone="danger" size={13} type="caption-12">{error}</StatusLine>}
        {filed && (
          <StatusLine tone="success" size={13} type="caption-12">
            {filed.rows} row{filed.rows === 1 ? '' : 's'} recorded.
          </StatusLine>
        )}
      </section>

      {w.rows.length > 0 && (
        <section className="flex flex-col gap-[8px]">
          <p className="label-10 text-[var(--text-muted)]">AFFECTED ROWS</p>
          <div className="overflow-x-auto rounded-[var(--radius-card)] border border-[var(--border-default)]">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-[var(--border-hairline)]">
                  {['run', 'value', 'published', 'proof'].map((h) => (
                    <th key={h} className="label-10 px-[14px] py-[8px] text-[var(--text-muted)]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {w.rows.map((r) => (
                  <tr key={r.proof} className="border-b border-[var(--border-hairline)] last:border-0">
                    <td className="mono-value-12_5 px-[14px] py-[8px] text-[var(--text-primary)]">
                      <Link href={`/runs/${r.run}`} className="text-[var(--semantic-link)] hover:underline">
                        {r.run}
                      </Link>
                    </td>
                    <td className="mono-value-12_5 max-w-[320px] truncate px-[14px] py-[8px] text-[var(--text-primary)]">{r.value}</td>
                    <td className="meta-12_5 px-[14px] py-[8px] text-[var(--text-secondary)]">{stamp(r.published_at)}</td>
                    <td className="mono-value-12_5 px-[14px] py-[8px] text-[var(--text-muted)]">
                      <Link href={`/explain/${r.proof}`} className="hover:underline">{r.proof}</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {rescrape.length > 0 && (
        <section className="flex flex-col gap-[8px]">
          <p className="label-10 text-[var(--text-muted)]">PAGES A FRESH READ WOULD REPLACE THESE FROM</p>
          <p className="meta-12_5 text-[var(--text-secondary)]">
            Rescraping is not triggered from here — this is the list a run, or{' '}
            <code className="mono-value-12_5">assay backfill</code>, needs.
          </p>
          <ul className="flex flex-col gap-[4px]">
            {[...new Set(rescrape.map((r) => r.url))].map((url) => (
              <li key={url} className="mono-value-12_5 truncate text-[var(--text-secondary)]">{url}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <div className="flex flex-col gap-[2px]">
      <p className="title-20 text-[var(--text-primary)]">{n}</p>
      <p className="caption-12 text-[var(--text-muted)]">{label}</p>
    </div>
  );
}
