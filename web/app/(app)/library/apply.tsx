'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { CircleAlert, Hammer, Play } from 'lucide-react';
import { type Tracker } from 'assay/engine/library/index';
import { Button } from '@/components/button';
import { approve, inspect, type ApproveResult, type InspectResult } from './actions';

/**
 * The link box, the button, and the table.
 *
 * THREE STATES, ONE COMPONENT. Before Run the table lists what this tracker
 * will look for, so the operator sees what they get before spending a fetch.
 * After Run it carries the values found on their page. After approval it
 * carries the baseline. The columns never move, which is what makes the table
 * readable as one thing changing rather than three screens.
 *
 * THE TABLE IS THE APPROVAL. `createTarget` is not called until the second
 * button, and what the operator is confirming is the middle state -- their own
 * values, read off their own page. That is the same confirmation the model's
 * proposal and the manual form both end in; there is no path here that skips it.
 *
 * A ROW THAT FOUND NOTHING IS SHOWN, NOT HIDDEN, and comes back unticked --
 * `createTarget` refuses the whole watch if any kept field resolves to nothing,
 * so leaving it ticked would cost the operator the fields that did work.
 */
export function Apply({ tracker: t }: { tracker: Tracker }) {
  const [url, setUrl] = useState('');
  const [read, setRead] = useState<InspectResult | null>(null);
  const [keep, setKeep] = useState<string[]>([]);
  const [result, setResult] = useState<ApproveResult | null>(null);
  const [reading, startRead] = useTransition();
  const [saving, startSave] = useTransition();

  const built = result?.build.ok ? result.build : null;

  const run = () =>
    startRead(async () => {
      setResult(null);
      const r = await inspect(t.id, url);
      setRead(r);
      if (r.ok) setKeep(r.fields.filter((f) => f.value !== null).map((f) => f.name));
    });

  return (
    <div className="flex flex-col gap-[16px]">
      {!built && (
        <div className="flex flex-wrap items-center gap-[10px]">
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && url.trim()) { e.preventDefault(); run(); }
            }}
            placeholder={t.placeholder}
            aria-label="Link"
            className="body-13_5 min-w-[240px] flex-1 rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--surface-card)] px-[12px] py-[9px] outline-none transition-colors duration-[var(--duration-tint)] placeholder:text-[var(--text-muted)] focus:border-[var(--semantic-link)]"
          />
          <Button
            variant="primary"
            icon={Play}
            loading={reading}
            disabled={url.trim().length === 0}
            onClick={run}
          >
            Run
          </Button>
        </div>
      )}

      <table className="w-full border-collapse">
        <tbody>
          {t.fields.map((f) => {
            const hit = read?.ok ? read.fields.find((x) => x.name === f.name) : undefined;
            const row = built?.fields.find((x) => x.field === f.name);
            const missing = read?.ok && hit?.value == null;
            return (
              <tr key={f.name} className="border-b border-[var(--border-hairline)] last:border-0">
                <th
                  scope="row"
                  className="caption-13 w-[132px] py-[10px] pr-[16px] text-left align-top font-normal text-[var(--text-secondary)]"
                >
                  {read?.ok && !built ? (
                    <label className="flex items-start gap-[8px]">
                      <input
                        type="checkbox"
                        checked={keep.includes(f.name)}
                        disabled={Boolean(missing)}
                        onChange={(e) =>
                          setKeep((p) =>
                            e.target.checked ? [...p, f.name] : p.filter((n) => n !== f.name))}
                        className="mt-[3px] size-[13px] shrink-0 accent-[var(--accent-brand)] disabled:opacity-40"
                      />
                      {f.label}
                    </label>
                  ) : (
                    f.label
                  )}
                </th>
                <td className="body-13_5 py-[10px] align-top text-[var(--text-primary)]">
                  {built
                    ? row
                      ? row.status === 'quarantined'
                        ? <span className="text-[var(--semantic-warning)]">held</span>
                        : row.baseline ?? <span className="text-[var(--text-muted)]">empty</span>
                      : <span className="text-[var(--text-muted)]">—</span>
                    : missing
                      ? <span className="caption-12 text-[var(--text-muted)]">not on this page</span>
                      : hit?.value ?? <span className="text-[var(--text-muted)]">—</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {read && !read.ok && (
        <p role="alert" className="flex items-start gap-[8px]">
          <CircleAlert size={14} strokeWidth={1.5} className="mt-[2px] shrink-0 text-[var(--semantic-danger)]" aria-hidden />
          <span className="meta-12_5 text-[var(--semantic-danger)]">{read.detail}</span>
        </p>
      )}

      {read?.ok && !built && (
        <div className="flex flex-wrap items-center gap-[12px]">
          <Button
            variant="primary"
            icon={Hammer}
            loading={saving}
            disabled={keep.length === 0}
            onClick={() =>
              startSave(async () =>
                setResult(await approve({
                  trackerId: t.id, url: read.url, keep, cadence: t.cadence,
                })))}
          >
            Start watching
          </Button>
          <span className="meta-12_5 text-[var(--text-secondary)]">every {t.cadence}</span>
        </div>
      )}

      {result && !result.build.ok && (
        <p role="alert" className="flex items-start gap-[8px]">
          <CircleAlert size={14} strokeWidth={1.5} className="mt-[2px] shrink-0 text-[var(--semantic-danger)]" aria-hidden />
          <span className="meta-12_5 text-[var(--semantic-danger)]">{result.build.detail}</span>
        </p>
      )}

      {built && (
        <div className="flex flex-wrap items-center gap-[16px]">
          <span className="meta-13 text-[var(--text-secondary)]">Watching {built.id}</span>
          <Link href="/runs" className="meta-13 text-[var(--semantic-link)]">See the run ›</Link>
          <Link href="/library" className="meta-13 text-[var(--text-secondary)]">Library</Link>
        </div>
      )}
    </div>
  );
}
