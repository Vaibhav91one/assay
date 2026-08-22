// The card half on a local instance, where there is nobody to sign in as.
//
// `lib/auth.ts` with AUTH_MODE unset returns one frozen operator and never
// consults a user table, so the email form on the other panel cannot succeed
// on this deployment -- there is no account for it to find. What the operator
// actually needs on a first run is their keys, so that is what the card asks
// for. Same shell, same headline, same photograph: only this half differs.
//
// The panel stores nothing. See `keys.ts` for why that is the honest shape
// rather than the lazy one.

import { ArrowRight } from 'lucide-react';
import { IconAlign, Lockup } from './chrome';
import { CopyLine } from './copy-line';
import { readKeys, envLines, type KeyPresence } from './keys';

/**
 * Presence, as a word and a colour.
 *
 * `semantic/warning` for a key that is absent, not `semantic/danger`:
 * docs/APP-DESIGN.md 5c reserves amber for "held, fragile, unconfigured --
 * needs attention, not broken", and an unset key is exactly that. Red here
 * would say the instance is broken, which is the opposite of the claim this
 * screen is making.
 */
function Presence({ set }: { set: boolean }) {
  const colour = set ? 'var(--semantic-success)' : 'var(--semantic-warning)';
  return (
    <span className="mt-[3px] flex shrink-0 items-center gap-[6px]">
      <span
        className="size-[6px] shrink-0 rounded-full"
        style={{ backgroundColor: colour }}
        aria-hidden
      />
      <span className="label-10" style={{ color: colour }}>
        {set ? 'SET' : 'NOT SET'}
      </span>
    </span>
  );
}

function Row({ name, buys, set }: KeyPresence) {
  return (
    <div className="flex items-start justify-between gap-[12px] px-[14px] py-[12px]">
      <span className="flex flex-col gap-[4px]">
        <span className="mono-value-12_5 text-[var(--text-primary)]">{name}</span>
        <span className="meta-12_5 text-[var(--text-secondary)]">{buys}</span>
      </span>
      <Presence set={set} />
    </div>
  );
}

export function KeyPanel() {
  const keys = readKeys();
  const missing = envLines(keys);

  return (
    <div className="flex flex-col gap-[24px]">
      <Lockup />

      <h2 className="display-44 text-[var(--text-primary)]">Configure your key</h2>

      {/* docs/APP-DESIGN.md 6b: the optionality of the model key belongs on
          this panel louder than anything else on it. Verbatim from 7.2. */}
      <p className="body-14 text-[var(--text-primary)]">
        Assay runs with no model. A model only ever proposes; the gate decides.
      </p>

      <div className="flex flex-col divide-y divide-[var(--border-hairline)] rounded-[var(--radius-control)] border border-[var(--border-default)]">
        {keys.map((k) => (
          <Row key={k.name} {...k} />
        ))}
      </div>

      {missing ? (
        <>
          <p className="meta-12_5 text-[var(--text-secondary)]">
            Assay reads these from the environment when it starts. Put what you want in{' '}
            <span className="mono-value-12_5">.env</span> and restart; what you leave out stays off.
          </p>
          <CopyLine text={missing} />
        </>
      ) : null}

      <a
        href="/"
        className="flex h-[48px] items-center justify-center gap-[10px] rounded-[var(--radius-control)] bg-[var(--text-primary)]"
      >
        <span className="body-14 text-[var(--text-inverse)]">Open Assay</span>
        <IconAlign size={14}>
          <ArrowRight size={18} strokeWidth={1.5} className="text-[var(--text-inverse)]" aria-hidden />
        </IconAlign>
      </a>
    </div>
  );
}
