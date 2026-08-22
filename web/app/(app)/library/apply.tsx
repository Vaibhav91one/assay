'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { CircleAlert, Hammer } from 'lucide-react';
import { CADENCES } from 'assay/engine/agent/models';
import { thresholdsOf, type Template } from 'assay/engine/library/index';
import { Button } from '@/components/button';
import { applyTemplate, type ApplyResult } from './actions';

/**
 * Applying a template: your URL, your values, one button.
 *
 * WHY IT ASKS FOR AN EXAMPLE AND NOT A SELECTOR. The template knows the field
 * NAMES for this shape and the tier each one deserves. It cannot know where the
 * value sits, because a shape is true of markup this repository has never seen
 * -- and FEATURES.md F7 forbids a text box a CSS selector could go into anyway.
 * So the operator pastes the value as they can read it on their own page and
 * the server derives the resolver from where that text actually lands in the
 * DOM. Same derivation as a model-made proposal, same refusal when it is not
 * there.
 *
 * The placeholder is the template's own `looks` sentence rather than a made-up
 * value. A prefilled real example is what makes an entry usable in thirty
 * seconds on the catalogue this borrowed from -- but theirs is a real handle on
 * a real site they operate against, and inventing one here would be a value
 * that is not on the operator's page and cannot be. A description of the shape
 * of the value is the honest version of the same affordance.
 *
 * BLANK IS ALLOWED AND MEANS "not this one". A page of this shape that carries
 * no reference number is still a page of this shape, and a template that
 * refused to apply without every field would be a template that fits nothing.
 */
export function Apply({ template: t }: { template: Template }) {
  const [url, setUrl] = useState('');
  const [cadence, setCadence] = useState(t.cadence);
  const [values, setValues] = useState<Record<string, string>>({});
  const [result, setResult] = useState<ApplyResult | null>(null);
  const [pending, start] = useTransition();

  const filled = t.fields.filter((f) => (values[f.name] ?? '').trim().length > 0);
  const usable = url.trim().length > 0 && filled.length > 0;

  if (result?.build.ok) return <Applied result={result} template={t} />;

  return (
    <div className="flex flex-col gap-[16px] rounded-[var(--radius-card)] border border-[var(--border-default)] bg-[var(--surface-card)] px-[18px] py-[16px]">
      <p className="caption-12_5 text-[var(--text-secondary)]">
        Paste each value as it reads on your page. Leave a field blank to skip it. Assay reads
        the page once, finds where each value sits, and establishes a baseline — that first
        read is what every later run is compared against.
      </p>

      <label className="flex flex-col gap-[5px]">
        <span className="label-10 text-[var(--text-muted)]">YOUR PAGE</span>
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.currentTarget.value)}
          placeholder="https://example.com/the-page"
          className="body-13_5 w-full rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--surface-card)] px-[12px] py-[9px] outline-none transition-colors duration-[var(--duration-tint)] placeholder:text-[var(--text-muted)] focus:border-[var(--semantic-link)]"
        />
      </label>

      <div className="flex flex-col gap-[8px]">
        <span className="label-10 text-[var(--text-muted)]">WHAT EACH VALUE READS AS</span>
        {t.fields.map((f) => {
          const { tau, delta } = thresholdsOf(f);
          return (
            <div key={f.name} className="flex flex-wrap items-center gap-[8px]">
              <span className="flex w-[168px] shrink-0 flex-col">
                <code className="mono-value-12_5 text-[var(--text-primary)]">{f.name}</code>
                <span className="caption-11 text-[var(--text-muted)]">
                  {f.policy} · τ {tau.toFixed(2)} · δ {delta.toFixed(2)}
                </span>
              </span>
              <input
                value={values[f.name] ?? ''}
                onChange={(e) =>
                  setValues((p) => ({ ...p, [f.name]: e.target.value }))}
                placeholder={f.looks}
                aria-label={`${f.name} — ${f.means}`}
                className="body-13_5 min-w-[200px] flex-1 rounded-[var(--radius-control)] border border-[var(--border-default)] px-[10px] py-[8px] outline-none transition-colors duration-[var(--duration-tint)] placeholder:text-[var(--text-muted)] focus:border-[var(--semantic-link)]"
              />
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-[14px]">
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
          loading={pending}
          disabled={!usable}
          onClick={() =>
            start(async () =>
              setResult(await applyTemplate({
                templateId: t.id,
                url: url.trim(),
                cadence,
                examples: t.fields.map((f) => ({ name: f.name, example: values[f.name] ?? '' })),
              })))}
        >
          {pending ? 'Reading the page for a baseline' : 'Start watching these fields'}
        </Button>

        <span className="meta-12_5 text-[var(--text-secondary)]">
          {filled.length} of {t.fields.length} field{t.fields.length === 1 ? '' : 's'}
        </span>
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
 * and whether the tier the template promised was actually written. A contract
 * that failed to save leaves the target on the engine's own defaults, which is a
 * different configuration from the one this screen described a moment ago -- so
 * it is reported rather than absorbed.
 */
function Applied({ result, template: t }: { result: ApplyResult; template: Template }) {
  const built = result.build;
  if (!built.ok) return null;

  const held = built.fields.filter((f) => f.status === 'quarantined');
  const failed = result.contracts.filter((c) => !c.ok);

  return (
    <div className="motion-fade-up flex flex-col gap-[14px] rounded-[var(--radius-card)] border border-[var(--border-default)] bg-[var(--surface-card)] px-[18px] py-[16px]">
      <p className="body-14 text-[var(--text-primary)]">Watching {built.id}.</p>
      <p className="caption-12_5 text-[var(--text-secondary)]">
        {held.length === 0
          ? 'The first run is done and the baseline is what the page said just now. Every run from here is compared against it.'
          : `The first run is done. ${held.length} field${held.length === 1 ? '' : 's'} came back held — Assay published nothing there rather than guess.`}
      </p>

      <ul className="flex flex-col gap-[7px]">
        {built.fields.map((f) => {
          const tier = t.fields.find((x) => x.name === f.field)?.policy;
          const contract = result.contracts.find((c) => c.field === f.field);
          return (
            <li key={f.field} className="flex flex-wrap items-baseline gap-x-[12px] gap-y-[2px]">
              <code className="mono-value-12_5 w-[150px] shrink-0 text-[var(--text-primary)]">
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
            The watch exists, but the tier this template promised was not written for{' '}
            {failed.map((c) => c.field).join(', ')}. Those fields are running on the engine&rsquo;s
            defaults — τ 0.60, δ 0.16. {failed[0]!.detail}
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
