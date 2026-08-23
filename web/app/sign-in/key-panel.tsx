// The card half on a local instance, where there is nobody to sign in as.
//
// `lib/auth.ts` with AUTH_MODE unset returns one frozen operator and never
// consults a user table, so the email form on the other panel cannot succeed
// on this deployment -- there is no account for it to find. What the operator
// actually needs on a first run is their keys, so that is what the card asks
// for. Same shell, same headline, same photograph: only this half differs.
//
// The panel stores nothing. See `keys.ts` for why that is the honest shape
// rather than the lazy one, and for why the rows are capabilities now.

import { Suspense } from 'react';
import { ArrowRight, ArrowUpRight, Check } from 'lucide-react';
import { IconAlign, Lockup } from './chrome';
import { readKeys, type KeyPresence, type ModelAuth } from './keys';
import { t } from '@/lib/copy';

/**
 * Green and a word, or a way to find out.
 *
 * The amber `NOT SET` badge this replaces was a status for a thing that has no
 * status: an absent credential is not a fault, it is a step the operator has
 * not taken yet, and the useful thing to hand them is the step. So the
 * unsatisfied side is a control rather than a label -- and it is the control
 * that replaced the paste block at the foot of the panel, which could name the
 * variables and never say what any of them were for.
 *
 * Each row carries its own `doc`, so the four credentials land on the four
 * sections that explain them rather than all four on one page the operator then
 * has to search.
 */
function Presence({ set, doc, name }: Pick<KeyPresence, 'set' | 'doc' | 'name'>) {
  if (set) {
    return (
      <span className="mt-[2px] flex shrink-0 items-center gap-[6px]">
        <Check
          size={14}
          strokeWidth={1.5}
          className="text-[var(--semantic-success)]"
          aria-hidden
        />
        {/* One pair for a credential's presence, product-wide: this badge said
            "Connected" while the Connections tab said "set" and "configured"
            for the same fact about the same three credentials. */}
        <span className="meta-12_5" style={{ color: 'var(--semantic-success)' }}>
          {t('common.configured')}
        </span>
      </span>
    );
  }

  return (
    <a
      href={doc}
      // A new tab, for the same reason as `settings/doc-link.tsx`: this panel
      // is what someone reads while setting credentials up, and following a
      // link out of it in place loses the list of what is still missing.
      target="_blank"
      rel="noopener noreferrer"
      // The accessible name has to say which credential. Four links all reading
      // "See documentation" is four identical entries in a screen reader's link
      // list, and the visible text is the same for all of them by design.
      aria-label={`See documentation for ${name} (opens in a new tab)`}
      className="press-row mt-[-2px] flex shrink-0 items-center gap-[6px] rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--surface-card)] py-[6px] pl-[10px] pr-[8px] transition-colors duration-[var(--duration-tint)] hover:bg-[var(--surface-subtle)]"
    >
      <span className="meta-12_5 text-[var(--text-primary)]">See documentation</span>
      <ArrowUpRight size={14} strokeWidth={1.5} className="text-[var(--text-muted)]" aria-hidden />
    </a>
  );
}

/**
 * One capability.
 *
 * Three text nodes, each in exactly one style. A mono run inside a sentence
 * would leave the Figma node's `textStyleId` `mixed`, and the board holds 100%
 * text-style coverage -- so the variable names are their own line rather than
 * being spliced into the prose above them.
 *
 * The third line answers different questions on the two sides. Satisfied, the
 * operator wants to know *which* route is carrying it, because they have three
 * and only one is in play. Unsatisfied, they want the variable to type.
 */
function Row({ name, buys, vars, set, via, doc }: KeyPresence) {
  return (
    <div className="flex items-start justify-between gap-[12px] px-[14px] py-[12px]">
      <span className="flex flex-col gap-[4px]">
        <span className="body-14 text-[var(--text-primary)]">{name}</span>
        <span className="meta-12_5 text-[var(--text-secondary)]">{buys}</span>
        {set ? (
          <span className="meta-12_5 text-[var(--text-muted)]">{via}</span>
        ) : (
          <span className="mono-value-12_5 text-[var(--text-muted)]">{vars.join('  or  ')}</span>
        )}
      </span>
      <Presence set={set} doc={doc} name={name} />
    </div>
  );
}

/**
 * The model row, resolved after the rest of the panel has painted.
 *
 * `modelAuth()` is cheap when either variable is set and slow when neither is:
 * it falls through to `claude auth status`, measured at 2.9-4.8s cold in
 * `src/ai/model.ts`. That is the case on exactly the machine this panel exists
 * for -- a first run, nothing configured -- so awaiting it inline would hold
 * the whole first paint of a fresh install behind a subprocess.
 *
 * The `await import` is what defers it, and it is load-bearing rather than
 * stylistic: it is the suspension point that lets React flush the shell and the
 * other two rows before this one blocks. It also keeps the Agent SDK, and the
 * Node built-ins under it, out of this module's eager graph.
 *
 * Settings pays the cost inline instead, and is right to: it is a screen you
 * navigate to on a running instance, where the probe has already been cached
 * for the life of the process by the time anyone opens it.
 */
async function ModelRow() {
  const { modelAuth } = await import('assay/engine/ai/model');
  return <Row {...readKeys(modelAuth() as ModelAuth)[0]} />;
}

/** The row as it reads before the probe answers. Not a spinner: the name and
 *  what it buys are known immediately and do not move when the answer lands. */
function ModelRowPending() {
  const row = readKeys('none')[0];
  return (
    <div className="flex items-start justify-between gap-[12px] px-[14px] py-[12px]">
      <span className="flex flex-col gap-[4px]">
        <span className="body-14 text-[var(--text-primary)]">{row.name}</span>
        <span className="meta-12_5 text-[var(--text-secondary)]">{row.buys}</span>
        <span className="mono-value-12_5 text-[var(--text-muted)]">{row.vars.join('  or  ')}</span>
      </span>
      <span className="mt-[2px] shrink-0 motion-shimmer meta-12_5" role="status">
        Checking
      </span>
    </div>
  );
}

export function KeyPanel() {
  // The two environment-only capabilities. `readKeys` wants a word for the
  // model route and these rows do not depend on it, so 'none' is passed and the
  // row it produces is dropped -- the Suspense boundary below owns that one.
  const envKeys = readKeys('none').slice(1);

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
        <Suspense fallback={<ModelRowPending />}>
          <ModelRow />
        </Suspense>
        {envKeys.map((k) => (
          <Row key={k.name} {...k} />
        ))}
      </div>

      {/* One text style for the whole sentence. The paste block that used to
          sit here is gone: it listed four variable names with no indication of
          what any of them bought, and it was wrong the moment a capability had
          a route that was not a variable -- it offered CLAUDE_CODE_OAUTH_TOKEN
          to a machine whose CLI login already satisfied the model path. Each
          row's own button now leads to the section that explains it. */}
      <p className="meta-12_5 text-[var(--text-secondary)]">
        Assay reads these from the environment when it starts. Put what you want in .env and
        restart; what you leave out stays off.
      </p>

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
