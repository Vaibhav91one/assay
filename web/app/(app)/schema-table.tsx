'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Check, ChevronDown, CircleAlert, Hand } from 'lucide-react';
import { Collapse } from '@/components/motion/collapse';
import { TIER_THRESHOLDS, DEFAULT_THRESHOLDS } from 'assay/engine/contracts/tiers';
import { HELD_BECAUSE } from 'assay/engine/reports/vocabulary';
import type { Proposal } from './watch-actions';

/**
 * The proposal, as the schema it would become, waiting on a person.
 *
 * ONE ROW PER FIELD, AND THE ROW IS THE OBSERVATION. There is exactly one
 * reading per field and that is not a stub: `assay_inspect` reads the page
 * once, so what exists is what the page said when Assay looked. A grid of
 * plausible-looking extra readings would be fabricated records on the screen
 * whose entire job is to be trusted, so this shows the one it has and says so
 * in the column head.
 *
 * WHY THE AXES TURNED. This was a column per field, which is the shape of the
 * fact -- one row of readings -- and the wrong shape for the screen. Every
 * field costs 150px of width in a 760px transcript, so three fit and the
 * fourth starts a horizontal scroll nothing announced; at the seven a real
 * proposal came back with, the names, the tick and the tier control were
 * colliding inside 150px while the values were clipped to a couple of words.
 * Down the page each field gets the full width for its value and costs 44px of
 * height, so the seven fit without scrolling and fifteen scroll vertically --
 * which is the direction a reader already expects a list to go, and the
 * direction the scrollbar below is drawn in.
 *
 * NOTHING IS CREATED UNTIL THE BUTTON IS CLICKED. The agent's tools are
 * read-only by construction (`src/agent/index.ts`, property 2) and this changes
 * none of that: the confirm posts `proposal.create` down the same path a
 * hand-filled form takes. There is no privileged "the agent said so" route into
 * the store.
 *
 * The tier disclosure is the field's real configuration, read from
 * `src/contracts` -- the tier vocabulary, the tau/delta each tier implies, what
 * happens on an abstention. It is a disclosure and not a control: FEATURES.md F2
 * says a user hand-tuning deltas per field is a user the tiers have failed, and
 * docs/APP-DESIGN.md 11 fails review for "a frame that exposes a raw threshold
 * as a control".
 */
export function SchemaTable({
  proposal,
  keep,
  onKeep,
}: {
  proposal: Proposal;
  keep: string[];
  onKeep: (names: string[]) => void;
}) {
  const fields = proposal.fields;

  return (
    <div className="w-full rounded-[var(--radius-card)] border border-[var(--border-hairline)]">
      <div className="flex items-baseline gap-[16px] border-b border-[var(--border-hairline)] px-[16px] py-[9px]">
        <span className="label-10 w-[230px] shrink-0 text-[var(--text-muted)]">FIELD</span>
        <span className="label-10 text-[var(--text-muted)]">ON THE PAGE, RIGHT NOW</span>
      </div>

      {/*
        The cap is seven rows and a sliver of the eighth. Seven because that is
        what a real proposal came back with and it should not scroll at all;
        the sliver because a list cut off flush at the border is a list that
        looks finished, and half a row showing is the cheapest possible
        statement that it is not.
      */}
      <ul className="scroller-visible max-h-[320px] overflow-y-auto overscroll-contain py-[4px]">
        {fields.map((f) => (
          <FieldRow
            key={f.name}
            field={f}
            on={keep.includes(f.name)}
            onToggle={() =>
              onKeep(keep.includes(f.name) ? keep.filter((n) => n !== f.name) : [...keep, f.name])
            }
          />
        ))}
      </ul>
    </div>
  );
}

/** One field: a tick to keep it, its name, its tier, and what the page says in it. */
function FieldRow({
  field, on, onToggle,
}: {
  field: Proposal['fields'][number]; on: boolean; onToggle: () => void;
}) {
  const [open, setOpen] = useState(false);
  // A field the model was least sure of gets the tier that interrupts a human
  // more often. That is the real mapping the confirm step will apply, not a
  // decoration -- see `tierFor`.
  const tier = tierFor(field.confidence);
  const t = TIER_THRESHOLDS[tier];

  return (
    <li className="px-[16px] py-[7px]">
      <div className="flex items-baseline gap-[16px]">
        <div className="flex w-[230px] shrink-0 items-baseline gap-[8px]">
          <label className="flex min-w-0 cursor-pointer items-baseline gap-[8px]">
            <input
              type="checkbox"
              checked={on}
              onChange={onToggle}
              aria-label={`Watch ${field.name}`}
              className="size-[14px] shrink-0 translate-y-[2px] accent-[var(--accent-brand)]"
            />
            <span className={`mono-value-13 truncate ${on ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)] line-through'}`}>
              {field.name}
            </span>
          </label>

          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label={`How ${field.name} is compared`}
            className="focus-ring ml-auto flex shrink-0 items-center gap-[4px] rounded-[var(--radius-control)] px-[4px] py-[2px] transition-colors duration-[var(--duration-tint)] hover:bg-[var(--surface-subtle)]"
          >
            <span className="caption-11 text-[var(--text-muted)]">{tier}</span>
            <ChevronDown
              size={11}
              strokeWidth={1.5}
              className="text-[var(--text-muted)] transition-transform duration-[var(--duration-pop)] ease-[var(--ease-glide)]"
              style={{ transform: open ? 'rotate(180deg)' : 'none' }}
              aria-hidden
            />
          </button>
        </div>

        <div className="min-w-0 flex-1">
          <Cell field={field} on={on} />
        </div>
      </div>

      <Collapse open={open} contentClassName="pt-[8px]">
        <dl className="flex max-w-[420px] flex-col gap-[5px] rounded-[var(--radius-control)] bg-[var(--surface-subtle)] p-[10px]">
          <Spec k="reads" v={field.selector} mono />
          <Spec k="tier" v={tier} />
          <Spec k="tau" v={t.tau.toFixed(2)} mono />
          <Spec k="delta" v={t.delta.toFixed(2)} mono />
          <Spec k="on hold" v={DEFAULT_THRESHOLDS.onAbstain.replace('_', ' ')} />
          <Spec k="auto-approve" v="clear margin" />
          <p className="caption-11 pt-[2px] leading-[1.45] text-[var(--text-secondary)]">
            {tier === 'strict'
              ? 'Interrupts you more often, on purpose. Below these numbers Assay holds the cell rather than guessing.'
              : 'Below these numbers Assay holds the cell rather than guessing.'}
          </p>
        </dl>
      </Collapse>
    </li>
  );
}

function Spec({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-[10px]">
      <dt className="caption-11 shrink-0 text-[var(--text-muted)]">{k}</dt>
      <dd className={`${mono ? 'mono-value-12_5' : 'caption-12'} min-w-0 truncate text-right text-[var(--text-primary)]`}>
        {v}
      </dd>
    </div>
  );
}

/**
 * What the page said, or an honest absence.
 *
 * The value is rendered as TEXT. It came off a scraped page, which the repo
 * treats as untrusted input everywhere (`src/ai/model.ts` header), so it is
 * never `dangerouslySetInnerHTML`'d and never fed to anything that would read it
 * as an instruction. A scraped string that addresses the reader is content being
 * displayed, not a command.
 */
function Cell({ field, on }: { field: Proposal['fields'][number]; on: boolean }) {
  if (field.example === null) {
    // An absence, and it says which absence it is. The element matched but
    // carries no text -- that is not the same fact as a held cell, so it does
    // not borrow held's amber.
    return (
      <span className="caption-12 text-[var(--text-muted)]">
        the element is there and empty
      </span>
    );
  }
  // Two lines, not three: a row per field means the row height is what decides
  // how many fields are on screen at once, and a full page width fits most
  // values on one line anyway.
  return (
    <span className={`body-13_5 line-clamp-2 break-words ${on ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'}`}>
      {field.example}
    </span>
  );
}

/**
 * A held cell.
 *
 * THIS IS THE SCREEN NOTHING ELSE IN THE CATEGORY HAS, so it gets weight rather
 * than a dash. A competitor's healer publishes its best guess; Assay publishes a
 * labelled hole, and this is what that hole looks like at the cell it happened
 * to.
 *
 * It is not blank, not an error and not a value. docs/APP-DESIGN.md 5 requires a
 * `Hole` to read as DELIBERATE -- never as loading, never as empty -- which is
 * why it carries a glyph, a border and a sentence rather than being styled down.
 * Amber, not red: docs/APP-DESIGN.md 5c binds held to `semantic/warning`, and
 * red would say something broke when what happened is that Assay declined to
 * guess.
 *
 * The reason arrives as an engine code and goes through `plain` before it is
 * shown: rule 5 of the same section says a code never reaches the user raw, and
 * a code with no wording is printed AS a code rather than given an invented one.
 */
export function HeldCell({ reason, targetId }: { reason: string | null; targetId?: string }) {
  const plain = reason ? HELD_BECAUSE[reason] ?? null : null;

  return (
    <div className="flex flex-col gap-[6px] rounded-[var(--radius-control)] border border-[var(--semantic-warning)] bg-[var(--semantic-warning-subtle)] px-[10px] py-[8px]">
      <span className="flex items-center gap-[6px]">
        <Hand size={13} strokeWidth={1.5} className="shrink-0 text-[var(--semantic-warning)]" aria-hidden />
        <span className="meta-12_5 text-[var(--text-primary)]">held</span>
      </span>
      <span className="caption-11 leading-[1.45] text-[var(--text-secondary)]">
        {plain
          ? `Nothing was published here: ${plain}.`
          : reason
            // No wording for this code. Printed as a code and marked as one,
            // never given an adjective this file made up.
            ? <>Nothing was published here. The gate recorded <span className="mono-value-12_5">{reason}</span>, which this screen has no wording for.</>
            : 'Nothing was published here. Assay could not tell what this field is now, so it declined to guess.'}
      </span>
      <Link
        href={targetId ? `/decisions?target=${encodeURIComponent(targetId)}` : '/decisions'}
        className="caption-11 self-start text-[var(--semantic-link)] hover:underline"
      >
        Decide it ›
      </Link>
    </div>
  );
}

/**
 * Which tier a proposed field starts on.
 *
 * The model's confidence is a word from a closed set, and it maps onto the tier
 * vocabulary rather than onto a number: `low` gets `strict`, which abstains more
 * often, because a field Assay was least sure of is the one where a wrong value
 * is most likely and most expensive. `normal` is what a contract that says
 * nothing already means, so `high` and `medium` change nothing.
 */
export function tierFor(confidence: 'high' | 'medium' | 'low'): 'strict' | 'normal' | 'loose' {
  return confidence === 'low' ? 'strict' : 'normal';
}

/** The word the confidence column shows. Two words, never a percentage. */
export function tone(c: 'high' | 'medium' | 'low') {
  return c === 'high'
    ? { word: 'clear', colour: 'var(--semantic-success)', Icon: Check }
    : { word: 'unsure', colour: 'var(--semantic-warning)', Icon: CircleAlert };
}
