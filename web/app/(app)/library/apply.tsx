'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { CircleAlert, Hammer, Search } from 'lucide-react';
import { CADENCES } from 'assay/engine/agent/models';
import { thresholdsOf, type Tracker } from 'assay/engine/library/index';
import { Button } from '@/components/button';
import { approve, inspect, type ApproveResult, type InspectResult } from './actions';

/**
 * Paste a URL, see what Assay found, approve.
 *
 * WHY THE MIDDLE STEP EXISTS. The whole point of a tracker is that the operator
 * does not have to say what to watch -- but "does not have to say" must not
 * become "does not get to see". So the fields arrive filled in with values read
 * off their own page, and the operator ticks, unticks and presses. That is the
 * same shape as the model's proposal on Home and the same shape as the review
 * on /skills: state it, then confirm it.
 *
 * A FIELD WITH NOTHING BEHIND IT COMES BACK UNTICKED, not hidden. "No price on
 * this page" is a real answer about their page and worth seeing -- hiding the
 * row would leave them wondering whether Assay looked. It is unticked because
 * `createTarget` refuses the whole watch if any kept field resolves to nothing.
 *
 * AMBIGUITY IS SHOWN RATHER THAN RESOLVED. When a prior matched several
 * elements the count is printed. Assay takes the first in document order --
 * which is what `pickTarget` will do on every run from here -- and says that it
 * was not the only one, because a quiet choice among several is the kind of
 * thing this product is supposed to surface.
 */
export function Apply({ tracker: t }: { tracker: Tracker }) {
  const [url, setUrl] = useState('');
  const [cadence, setCadence] = useState(t.cadence);
  const [read, setRead] = useState<InspectResult | null>(null);
  const [keep, setKeep] = useState<string[]>([]);
  const [result, setResult] = useState<ApproveResult | null>(null);
  const [reading, startRead] = useTransition();
  const [saving, startSave] = useTransition();

  if (result?.build.ok) return <Watching result={result} tracker={t} />;

  const look = (target: string) =>
    startRead(async () => {
      setResult(null);
      const r = await inspect(t.id, target);
      setRead(r);
      if (r.ok) setKeep(r.fields.filter((f) => f.value !== null).map((f) => f.name));
    });

  return (
    <div className="flex flex-col gap-[14px] rounded-[var(--radius-card)] border border-[var(--border-default)] bg-[var(--surface-card)] px-[18px] py-[16px]">
      <label className="flex flex-col gap-[5px]">
        <span className="label-10 text-[var(--text-muted)]">YOUR PAGE</span>
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && url.trim()) { e.preventDefault(); look(url); }
          }}
          placeholder="https://example.com/the-page"
          className="body-13_5 w-full rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--surface-card)] px-[12px] py-[9px] outline-none transition-colors duration-[var(--duration-tint)] placeholder:text-[var(--text-muted)] focus:border-[var(--semantic-link)]"
        />
      </label>

      {/* For somebody with no page in mind. One click fills the box and reads
          it, so the feature can be seen working before it is trusted. */}
      {!read && t.examples.length > 0 && (
        <div className="flex flex-col gap-[4px]">
          {t.examples.map((x) => (
            <button
              key={x.url}
              type="button"
              onClick={() => { setUrl(x.url); look(x.url); }}
              className="caption-12 self-start text-left text-[var(--semantic-link)] hover:underline"
            >
              Try it on {x.label}
            </button>
          ))}
        </div>
      )}

      {read?.ok && (
        <div className="flex flex-col gap-[9px]">
          <p className="caption-12_5 text-[var(--text-secondary)]">
            What Assay found on that page. Untick anything you do not want watched.
          </p>
          <ul className="flex flex-col gap-[9px]">
            {t.fields.map((f) => {
              const hit = read.fields.find((x) => x.name === f.name);
              const { tau, delta } = thresholdsOf(f);
              const missing = hit?.value == null;
              return (
                <li key={f.name} className="flex items-start gap-[10px]">
                  <input
                    type="checkbox"
                    id={`keep-${f.name}`}
                    checked={keep.includes(f.name)}
                    disabled={missing}
                    onChange={(e) =>
                      setKeep((p) =>
                        e.target.checked ? [...p, f.name] : p.filter((n) => n !== f.name))}
                    className="mt-[3px] size-[14px] shrink-0 accent-[var(--accent-brand)] disabled:opacity-40"
                  />
                  <label htmlFor={`keep-${f.name}`} className="flex min-w-0 flex-1 flex-col gap-[2px]">
                    <span className="flex flex-wrap items-baseline gap-x-[10px]">
                      <code className="mono-value-12_5 text-[var(--text-primary)]">{f.name}</code>
                      <span className="caption-11 text-[var(--text-muted)]">
                        {f.policy} · τ {tau.toFixed(2)} · δ {delta.toFixed(2)}
                      </span>
                      {!missing && hit!.matches > 1 && (
                        <span className="caption-11 text-[var(--text-muted)]">
                          first of {hit!.matches} that matched
                        </span>
                      )}
                    </span>
                    {missing ? (
                      <span className="caption-12 text-[var(--text-secondary)]">
                        nothing on this page looks like {f.means.toLowerCase().replace(/\.$/, '')}
                      </span>
                    ) : (
                      <span className="body-13_5 line-clamp-3 break-words text-[var(--text-primary)]">
                        {hit!.value}
                      </span>
                    )}
                  </label>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {read && !read.ok && (
        <p role="alert" className="flex items-start gap-[8px]">
          <CircleAlert size={14} strokeWidth={1.5} className="mt-[2px] shrink-0 text-[var(--semantic-danger)]" aria-hidden />
          <span className="meta-12_5 text-[var(--semantic-danger)]">{read.detail}</span>
        </p>
      )}

      <div className="flex flex-wrap items-center gap-[14px]">
        {read?.ok ? (
          <>
            <label className="flex items-center gap-[8px]">
              <span className="caption-12 text-[var(--text-secondary)]">check every</span>
              <select
                value={cadence}
                onChange={(e) => setCadence(e.currentTarget.value)}
                className="meta-12_5 rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--surface-card)] px-[8px] py-[6px] outline-none"
              >
                {CADENCES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <Button
              variant="primary"
              icon={Hammer}
              loading={saving}
              disabled={keep.length === 0}
              onClick={() =>
                startSave(async () =>
                  setResult(await approve({ trackerId: t.id, url: read.url, keep, cadence })))}
            >
              {saving ? 'Establishing a baseline' : 'Start watching'}
            </Button>
            <button
              type="button"
              onClick={() => { setRead(null); setKeep([]); }}
              className="meta-13 text-[var(--text-secondary)] hover:underline"
            >
              Try another page
            </button>
          </>
        ) : (
          <Button
            variant="primary"
            icon={Search}
            loading={reading}
            disabled={url.trim().length === 0}
            onClick={() => look(url)}
          >
            {reading ? 'Reading the page' : 'Read the page'}
          </Button>
        )}
      </div>

      {result && !result.build.ok && (
        <p role="alert" className="flex items-start gap-[8px]">
          <CircleAlert size={14} strokeWidth={1.5} className="mt-[2px] shrink-0 text-[var(--semantic-danger)]" aria-hidden />
          <span className="meta-12_5 text-[var(--semantic-danger)]">{result.build.detail}</span>
        </p>
      )}
    </div>
  );
}

/**
 * After the baseline run.
 *
 * Two facts, kept apart because they fail apart: what the page said at baseline,
 * and whether the tier the tracker promised was actually written. A contract
 * that failed to save leaves the target on the engine's own defaults, which is a
 * different configuration from the one this screen described a moment ago.
 */
function Watching({ result, tracker: t }: { result: ApproveResult; tracker: Tracker }) {
  const built = result.build;
  if (!built.ok) return null;

  const held = built.fields.filter((f) => f.status === 'quarantined');
  const failed = result.contracts.filter((c) => !c.ok);

  return (
    <div className="motion-fade-up flex flex-col gap-[14px] rounded-[var(--radius-card)] border border-[var(--border-default)] bg-[var(--surface-card)] px-[18px] py-[16px]">
      <p className="body-14 text-[var(--text-primary)]">Watching {built.id}.</p>
      <p className="caption-12_5 text-[var(--text-secondary)]">
        {held.length === 0
          ? 'The baseline is what the page said just now. Every run from here is compared against it.'
          : `${held.length} field${held.length === 1 ? '' : 's'} came back held — Assay published nothing there rather than guess.`}
      </p>

      <ul className="flex flex-col gap-[7px]">
        {built.fields.map((f) => {
          const tier = t.fields.find((x) => x.name === f.field)?.policy;
          const contract = result.contracts.find((c) => c.field === f.field);
          return (
            <li key={f.field} className="flex flex-wrap items-baseline gap-x-[12px] gap-y-[2px]">
              <code className="mono-value-12_5 w-[130px] shrink-0 text-[var(--text-primary)]">
                {f.field}
              </code>
              <span className="body-13_5 min-w-0 flex-1 truncate text-[var(--text-secondary)]">
                {f.status === 'quarantined'
                  ? <span className="text-[var(--semantic-warning)]">held — nothing published</span>
                  : f.baseline ?? 'the element is there and empty'}
              </span>
              <span className="caption-11 shrink-0 text-[var(--text-muted)]">
                {contract?.ok ? `contract v1 · ${tier}` : 'no contract — engine defaults'}
              </span>
            </li>
          );
        })}
      </ul>

      {failed.length > 0 && (
        <p role="alert" className="flex items-start gap-[8px]">
          <CircleAlert size={14} strokeWidth={1.5} className="mt-[2px] shrink-0 text-[var(--semantic-warning)]" aria-hidden />
          <span className="meta-12_5 text-[var(--semantic-warning)]">
            The watch exists, but the tier this tracker promised was not written for{' '}
            {failed.map((c) => c.field).join(', ')} — those fields are on the engine defaults,
            τ 0.60 and δ 0.16. {failed[0]!.detail}
          </span>
        </p>
      )}

      <div className="flex flex-wrap gap-[16px]">
        <Link href="/runs" className="meta-13 text-[var(--semantic-link)]">See the run ›</Link>
        {held.length > 0 && (
          <Link href="/decisions" className="meta-13 text-[var(--semantic-link)]">
            Decide the held {held.length === 1 ? 'field' : 'fields'} ›
          </Link>
        )}
        <Link href="/library" className="meta-13 text-[var(--text-secondary)]">Back to the library</Link>
      </div>
    </div>
  );
}
