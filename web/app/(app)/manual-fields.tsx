'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { CircleAlert, Hammer, Plus, X } from 'lucide-react';
import { CADENCE_OPTIONS } from '@/lib/models';
import { describeFields, type BuildResult } from './watch-actions';

/**
 * "Describe the fields yourself" -- the path with no model in it.
 *
 * Home's copy has promised this since the first build and there was no form
 * behind it. It exists because the model is optional by design: `converse`
 * degrades to `kind: 'manual'` with no key, and docs/APP-DESIGN.md 7.2 says a
 * model only ever proposes while the gate decides. So the whole product has to
 * be reachable without one, and this is that route.
 *
 * WHAT THIS FORM DOES NOT ASK FOR: a selector. FEATURES.md F7 is "No selector
 * editing. Ever", and docs/APP-DESIGN.md 1 records that the user "at no point
 * writes or edits a selector" as a refusal Assay is NOT violating. So the
 * operator names the field and pastes an example of the value they can see on
 * the page, and the server derives the resolver from where that text actually
 * sits in the DOM -- the same derivation `resolverFor` does for a proposal.
 * There is no text box here that a CSS selector goes into.
 */
export function ManualFields({ seedUrl, onCancel }: { seedUrl: string; onCancel: () => void }) {
  const [url, setUrl] = useState(seedUrl);
  const [cadence, setCadence] = useState('6h');
  const [rows, setRows] = useState<{ name: string; example: string }[]>([{ name: '', example: '' }]);
  const [built, setBuilt] = useState<BuildResult | null>(null);
  const [pending, start] = useTransition();

  const usable = url.trim().length > 0 && rows.some((r) => r.name.trim() && r.example.trim());

  if (built?.ok) {
    return (
      <div className="motion-fade-up flex w-full flex-col gap-[10px] rounded-[var(--radius-card)] border border-[var(--border-default)] bg-[var(--surface-card)] px-[20px] py-[16px]">
        <p className="body-14 text-[var(--text-primary)]">Watching {built.id}.</p>
        <ul className="flex flex-col gap-[6px]">
          {built.fields.map((f) => (
            <li key={f.field} className="flex items-baseline gap-[12px]">
              <span className="mono-value-13 shrink-0 text-[var(--text-primary)]">{f.field}</span>
              <span className="body-13_5 min-w-0 flex-1 truncate text-[var(--text-secondary)]">
                {f.status === 'quarantined'
                  ? <span className="text-[var(--semantic-warning)]">held -- nothing published</span>
                  : f.baseline ?? 'the element is there and empty'}
              </span>
            </li>
          ))}
        </ul>
        <Link href="/runs" className="meta-13 self-start text-[var(--semantic-link)]">See the run ›</Link>
      </div>
    );
  }

  return (
    <div className="motion-fade-up flex w-full flex-col gap-[14px] rounded-[var(--radius-card)] border border-[var(--border-default)] bg-[var(--surface-card)] px-[20px] py-[18px]">
      <div className="flex items-start justify-between gap-[16px]">
        <div className="flex flex-col gap-[2px]">
          <p className="body-14 text-[var(--text-primary)]">Describe the fields yourself</p>
          <p className="caption-12 text-[var(--text-secondary)]">
            Paste an example of each value as it appears on the page. Assay finds where it
            sits and watches that spot -- you never write a selector.
          </p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          aria-label="Close"
          className="press-icon shrink-0 rounded-[var(--radius-control)] p-[4px] text-[var(--text-muted)] hover:bg-[var(--surface-subtle)]"
        >
          <X size={15} strokeWidth={1.5} aria-hidden />
        </button>
      </div>

      <label className="flex flex-col gap-[5px]">
        <span className="label-10 text-[var(--text-muted)]">PAGE</span>
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.currentTarget.value)}
          placeholder="https://example.com/the-page"
          className="body-13_5 w-full rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--surface-card)] px-[12px] py-[9px] outline-none transition-colors duration-[var(--duration-tint)] placeholder:text-[var(--text-muted)] focus:border-[var(--semantic-link)]"
        />
      </label>

      <div className="flex flex-col gap-[8px]">
        <span className="label-10 text-[var(--text-muted)]">FIELDS</span>
        {rows.map((r, i) => (
          <div key={i} className="flex items-center gap-[8px]">
            <input
              value={r.name}
              onChange={(e) => setRows((p) => p.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
              placeholder="price"
              aria-label={`Field ${i + 1} name`}
              className="mono-value-12_5 w-[150px] shrink-0 rounded-[var(--radius-control)] border border-[var(--border-default)] px-[10px] py-[8px] outline-none transition-colors duration-[var(--duration-tint)] placeholder:text-[var(--text-muted)] focus:border-[var(--semantic-link)]"
            />
            <input
              value={r.example}
              onChange={(e) => setRows((p) => p.map((x, j) => (j === i ? { ...x, example: e.target.value } : x)))}
              placeholder="the value as it reads on the page"
              aria-label={`Field ${i + 1} example`}
              className="body-13_5 min-w-0 flex-1 rounded-[var(--radius-control)] border border-[var(--border-default)] px-[10px] py-[8px] outline-none transition-colors duration-[var(--duration-tint)] placeholder:text-[var(--text-muted)] focus:border-[var(--semantic-link)]"
            />
            {rows.length > 1 && (
              <button
                type="button"
                onClick={() => setRows((p) => p.filter((_, j) => j !== i))}
                aria-label={`Remove field ${i + 1}`}
                className="press-icon shrink-0 rounded-[var(--radius-control)] p-[5px] text-[var(--text-muted)] hover:bg-[var(--surface-subtle)]"
              >
                <X size={14} strokeWidth={1.5} aria-hidden />
              </button>
            )}
          </div>
        ))}
        {rows.length < 12 && (
          <button
            type="button"
            onClick={() => setRows((p) => [...p, { name: '', example: '' }])}
            className="flex items-center gap-[6px] self-start rounded-[var(--radius-control)] px-[6px] py-[4px] text-[var(--text-secondary)] transition-colors duration-[var(--duration-tint)] hover:bg-[var(--surface-subtle)]"
          >
            <Plus size={13} strokeWidth={1.5} aria-hidden />
            <span className="caption-12">Add a field</span>
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-[14px]">
        <label className="flex items-center gap-[8px]">
          <span className="caption-12 text-[var(--text-secondary)]">check every</span>
          <select
            value={cadence}
            onChange={(e) => setCadence(e.currentTarget.value)}
            className="meta-12_5 rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--surface-card)] px-[8px] py-[6px] outline-none"
          >
            {CADENCE_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>

        <button
          type="button"
          disabled={pending || !usable}
          onClick={() =>
            start(async () =>
              setBuilt(await describeFields({
                url: url.trim(),
                cadence,
                fields: rows
                  .map((r) => ({ name: r.name.trim(), example: r.example.trim() }))
                  .filter((r) => r.name && r.example),
              })))
          }
          className="press-wide flex h-[38px] items-center gap-[10px] rounded-[var(--radius-control)] bg-[var(--accent-brand)] px-[16px] disabled:opacity-60"
        >
          <Hammer size={15} strokeWidth={1.5} className="text-[var(--accent-on-primary)]" aria-hidden />
          <span className="body-13_5 text-[var(--accent-on-primary)]">
            {pending ? 'Reading the page' : 'Start watching'}
          </span>
        </button>
      </div>

      {built && !built.ok && (
        <p role="alert" className="flex items-start gap-[8px]">
          <CircleAlert size={14} strokeWidth={1.5} className="mt-[2px] shrink-0 text-[var(--semantic-danger)]" aria-hidden />
          <span className="meta-12_5 text-[var(--semantic-danger)]">{built.detail}</span>
        </p>
      )}
    </div>
  );
}
