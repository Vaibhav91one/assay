'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { Ban, Check, Globe, KeyRound, Terminal } from 'lucide-react';
import { setEnabled, type SkillState } from './actions';

/**
 * The skills list, and the review that has to happen before one is turned on.
 *
 * NOTHING IS ENABLED BY A SINGLE CLICK. "Enable" opens a review that names every
 * host the connector will reach and every variable it will read, and only the
 * button inside that review turns it on. That ordering is the whole feature: the
 * registry it is modelled on shows install counts and stars and does not show
 * `allowed-tools` or required credentials at all, so an operator there confirms
 * something they have not been told the shape of.
 *
 * NO VALUE IS RENDERED HERE, AND THERE IS NONE TO RENDER. A row carries variable
 * NAMES and booleans. There is no input for a credential on this screen and
 * there will not be one: the process that makes the request reads its own
 * environment, and a form here could only ever write into Next's memory -- gone
 * on restart, invisible to the worker. `web/app/sign-in/keys.ts` states the same
 * rule for the same reason.
 *
 * A ROW THAT CANNOT RUN SAYS SO AND HAS NO BUTTON. `inert` is a sentence, not a
 * disabled control -- docs/STATES.md 1 #11: everything clickable has a defined
 * consequence, or it does not exist.
 */
export function SkillsList({ initial }: { initial: SkillState[] }) {
  const [skills, setSkills] = useState(initial);
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function toggle(id: string, on: boolean) {
    start(async () => {
      setSkills(await setEnabled(id, on));
      setReviewing(null);
    });
  }

  return (
    <ul className="flex flex-col gap-[10px]">
      {skills.map((s) => (
        <li
          key={s.id}
          className="flex flex-col gap-[10px] rounded-[var(--radius-card)] border border-[var(--border-default)] bg-[var(--surface-card)] px-[18px] py-[15px]"
        >
          <div className="flex items-baseline gap-[10px]">
            <span className="mono-value-13 text-[var(--text-primary)]">{s.name}</span>
            <span className="caption-11 text-[var(--text-muted)]">
              {s.origin.registry === 'assay' ? 'built in' : s.origin.registry}
            </span>
            <span className="ml-auto shrink-0">
              <Status skill={s} />
            </span>
          </div>

          <p className="caption-13 text-[var(--text-secondary)]">{s.summary}</p>

          {/* Why it cannot run. A fact about this agent, said in full, because
              "unavailable" would leave the operator guessing at a reason that
              is actually the most interesting thing on the screen. */}
          {s.inert && (
            <p className="caption-12_5 rounded-[var(--radius-control)] bg-[var(--surface-subtle)] px-[12px] py-[10px] text-[var(--text-secondary)]">
              {s.inert}
            </p>
          )}

          <Needs skill={s} />

          {/* Bright Data is real and wired, but it is configured where deliveries
              are configured. A second enable path here would be two switches for
              one fact. */}
          {s.provides === 'delivery' && (
            <p className="caption-12_5 text-[var(--text-muted)]">
              Configured on the connectors surface, not here — Bright Data pushes a page
              to Assay rather than being fetched from.
            </p>
          )}

          {s.provides === 'page-source' && !s.always && (
            reviewing === s.id ? (
              <Review skill={s} pending={pending} onConfirm={() => toggle(s.id, true)} onCancel={() => setReviewing(null)} />
            ) : (
              <div className="flex items-center gap-[10px]">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => (s.enabled ? toggle(s.id, false) : setReviewing(s.id))}
                  className="press-row rounded-[var(--radius-control)] border border-[var(--border-default)] px-[12px] py-[7px] text-[var(--text-primary)] transition-colors duration-[var(--duration-tint)] hover:bg-[var(--surface-subtle)] disabled:opacity-50"
                >
                  <span className="meta-12_5">{s.enabled ? 'Turn off' : 'Enable…'}</span>
                </button>
                {s.enabled && !s.satisfied && (
                  <span className="caption-12 text-[var(--semantic-warning)]">
                    Enabled, but it cannot run until {s.missing.join(' and ')} is set.
                  </span>
                )}
              </div>
            )
          )}

          {s.always && (
            <p className="caption-12_5 text-[var(--text-muted)]">
              Always on. This is how Assay reads a page unless something here is enabled
              and the direct request is refused.
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}

/** One word about whether it will be used, coloured the way the product colours. */
function Status({ skill: s }: { skill: SkillState }) {
  if (s.provides === null) {
    return (
      <span className="caption-11 inline-flex items-center gap-[5px] text-[var(--text-muted)]">
        <Ban size={12} strokeWidth={1.5} aria-hidden /> cannot run here
      </span>
    );
  }
  if (s.active) {
    return (
      <span className="caption-11 inline-flex items-center gap-[5px] text-[var(--semantic-success)]">
        <Check size={12} strokeWidth={2} aria-hidden /> in use
      </span>
    );
  }
  // Held is amber everywhere in this product. "Enabled but unsatisfied" is the
  // waiting-on-you state, so it takes the same colour.
  if (s.enabled) {
    return <span className="caption-11 text-[var(--semantic-warning)]">waiting on a key</span>;
  }
  return <span className="caption-11 text-[var(--text-muted)]">off</span>;
}

/** The credentials a skill declares, by name, and whether each is present. */
function Needs({ skill: s }: { skill: SkillState }) {
  if (!s.needs.length) return null;
  return (
    <ul className="flex flex-col gap-[6px]">
      {s.needs.map((n) => {
        const set = !s.missing.includes(n.var);
        return (
          <li key={n.var} className="flex items-baseline gap-[8px]">
            <KeyRound
              size={12}
              strokeWidth={1.5}
              aria-hidden
              className="translate-y-[2px] shrink-0"
              style={{ color: set ? 'var(--semantic-success)' : 'var(--text-muted)' }}
            />
            <code className="mono-value-12_5 shrink-0 text-[var(--text-primary)]">{n.var}</code>
            <span className="caption-12 text-[var(--text-secondary)]">
              {set ? 'set in this process’s environment' : 'not set'} — {n.why}
            </span>
            <Link
              href={n.doc}
              className="caption-12 ml-auto shrink-0 text-[var(--semantic-link)] hover:underline"
            >
              docs
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * What confirming actually grants, said before it is granted.
 *
 * Every line here is read off the registry entry rather than written per skill,
 * so a row that reaches no host says it reaches no host instead of the sentence
 * being quietly omitted -- a rendered absence has to read as deliberate.
 */
function Review({
  skill: s, pending, onConfirm, onCancel,
}: {
  skill: SkillState; pending: boolean; onConfirm: () => void; onCancel: () => void;
}) {
  return (
    <div className="flex flex-col gap-[10px] rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--surface-subtle)] px-[14px] py-[12px]">
      <p className="meta-12_5 text-[var(--text-primary)]">Before you turn this on</p>

      <p className="caption-12_5 flex items-baseline gap-[8px] text-[var(--text-secondary)]">
        <Globe size={12} strokeWidth={1.5} aria-hidden className="translate-y-[2px] shrink-0" />
        {s.hosts.length ? (
          <span>
            Assay will send the page’s URL to{' '}
            <code className="mono-value-12_5 text-[var(--text-primary)]">{s.hosts.join(', ')}</code>{' '}
            and read the HTML that comes back. Only when a direct request has already failed.
          </span>
        ) : (
          <span>It reaches no host of its own.</span>
        )}
      </p>

      <p className="caption-12_5 flex items-baseline gap-[8px] text-[var(--text-secondary)]">
        <Terminal size={12} strokeWidth={1.5} aria-hidden className="translate-y-[2px] shrink-0" />
        {s.demands.length
          ? `It asks the agent for ${s.demands.join(', ')}, which Assay does not grant.`
          : 'It runs no code here and asks the agent for no tools. Assay makes one HTTP request and parses the reply.'}
      </p>

      <p className="caption-12_5 flex items-baseline gap-[8px] text-[var(--text-secondary)]">
        <KeyRound size={12} strokeWidth={1.5} aria-hidden className="translate-y-[2px] shrink-0" />
        {s.needs.length
          ? `It reads ${s.needs.map((n) => n.var).join(' and ')} from this process’s environment. Assay never renders, logs or stores the value.`
          : 'It needs no credential.'}
      </p>

      <p className="caption-12_5 text-[var(--text-secondary)]">
        What it returns is a page, and a page is untrusted input. It goes through the
        same tau and delta gate as every other page — a value that cannot be justified
        is held, not published.
      </p>

      <div className="flex items-center gap-[10px] pt-[2px]">
        <button
          type="button"
          disabled={pending}
          onClick={onConfirm}
          className="press-row rounded-[var(--radius-control)] bg-[var(--accent-brand)] px-[12px] py-[7px] text-[var(--accent-on-primary)] disabled:opacity-50"
        >
          <span className="meta-12_5">Enable {s.name}</span>
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={onCancel}
          className="press-row rounded-[var(--radius-control)] px-[10px] py-[7px] text-[var(--text-secondary)] hover:bg-[var(--surface-card)] disabled:opacity-50"
        >
          <span className="meta-12_5">Cancel</span>
        </button>
        {!s.satisfied && (
          <span className="caption-12 text-[var(--text-muted)]">
            {s.missing.join(' and ')} is not set — you can enable it now and set that after.
          </span>
        )}
      </div>
    </div>
  );
}
