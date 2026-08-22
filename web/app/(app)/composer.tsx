'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowRight, AtSign, Check, ChevronDown, KeyRound, Slash, Terminal } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useGlide } from '@/components/motion/glide';
import { MODELS, MODEL_LABEL } from 'assay/engine/agent/models';
import { menuAt, applyChoice, insertSigil, type Menu } from '@/lib/composer-menu';
import { sources as loadSources, type Source } from './watch-actions';

/**
 * The composer on "What should Assay watch?".
 *
 * WHAT IS NOT HERE, AND WHY.
 *
 * There is no paperclip. docs/STATES.md 1 #11 deleted it along with the chat
 * bars, and the reason survives the redesign: nothing in Assay reads an
 * uploaded file, so an attach button is a control with no consequence. The same
 * document's rule is the one that decides it -- "everything clickable has a
 * defined consequence and states, or it does not exist." Re-add it the day a
 * capture can be uploaded, not before.
 *
 * There is no rainbow sweep on model change. `glimm` is a real package (MIT,
 * ~21k weekly installs) so this was a choice rather than a dead end: a
 * celebratory shader is the wrong register for a product whose whole personality
 * is refusing to overclaim, and it would be a 126KB dependency with no public
 * source to audit, on a surface that reads untrusted pages.
 *
 * The menus list what this instance actually has. `@` is the fields already
 * under watch, read live; `/` is routes that exist. Neither invents a row, and
 * an empty one says it is empty.
 */

export interface Command {
  name: string;
  hint: string;
  href: string;
}

/**
 * `/` commands. Every one navigates somewhere that exists -- these routes are in
 * `web/app/(app)`, and `/fields?show=held` is the filter docs/STATES.md 1 #3
 * settled on ("route to Fields filtered to held -- no new screen").
 *
 * Deliberately not a command palette. docs/APP-DESIGN.md 10 files cmd-K as a v2
 * omission, so this stays four destinations rather than growing into one.
 */
const COMMANDS: Command[] = [
  { name: 'decisions', hint: 'held rows waiting on a person', href: '/decisions' },
  { name: 'held', hint: 'every field currently holding a cell', href: '/fields?show=held' },
  { name: 'runs', hint: 'what every scraper did last', href: '/runs' },
  { name: 'fields', hint: 'everything under watch', href: '/fields' },
  { name: 'skills', hint: 'what Assay can be given, and what each one needs', href: '/skills' },
];

export function Composer({
  auth,
  model,
  onModel,
  onSubmit,
  busy,
}: {
  /** Resolved on the server by `modelAuth()`. A string, so a new state cannot crash this. */
  auth: string;
  model: string;
  onModel: (m: string) => void;
  onSubmit: (text: string) => void;
  busy: boolean;
}) {
  const box = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState('');
  const [menu, setMenu] = useState<Menu | null>(null);
  const [active, setActive] = useState(0);
  const [sources, setSources] = useState<Source[] | null>(null);
  const router = useRouter();

  // Fetched when `@` is first typed, not at mount: a menu nobody opens should
  // not cost a query on every page load.
  useEffect(() => {
    if (menu?.sigil === '@' && sources === null) loadSources().then(setSources).catch(() => setSources([]));
  }, [menu?.sigil, sources]);

  const rows = menu ? matches(menu, sources) : [];
  useEffect(() => { setActive(0); }, [menu?.sigil, menu?.query]);

  function grow(el: HTMLTextAreaElement) {
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 240)}px`;
  }

  /** Re-read the caret after every change: that is what decides if a menu is open. */
  function change(el: HTMLTextAreaElement) {
    setText(el.value);
    grow(el);
    setMenu(menuAt(el.value, el.selectionStart));
  }

  function choose(i: number) {
    const el = box.current;
    if (!el || !menu) return;
    const row = rows[i];
    if (!row) return;
    if (row.kind === 'command') { router.push(row.href); setMenu(null); return; }
    // Replace the sigil and everything typed after it with the target's id.
    const { value, caret } = applyChoice(text, menu, row.id);
    setText(value);
    setMenu(null);
    queueMicrotask(() => {
      el.focus();
      el.setSelectionRange(caret, caret);
      grow(el);
    });
  }

  function keyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (menu && rows.length) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => (i + 1) % rows.length); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => (i - 1 + rows.length) % rows.length); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); choose(active); return; }
      if (e.key === 'Escape') { e.preventDefault(); setMenu(null); return; }
    }
    // Enter sends; Shift+Enter is a newline. A URL is one line, and needing to
    // reach for a button to send one is friction. Unchanged from the textarea
    // this replaced.
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  function send() {
    const message = text.trim();
    if (!message || busy) return;
    onSubmit(message);
    setText('');
    setMenu(null);
    if (box.current) box.current.style.height = 'auto';
  }

  return (
    <div className="relative w-full">
      {menu && <MenuList rows={rows} active={active} onChoose={choose} sigil={menu.sigil} />}

      <form
        className="flex w-full flex-col rounded-[var(--radius-card)] border border-[var(--border-default)] bg-[var(--surface-card)] px-[20px] pb-[12px] pt-[18px] transition-colors duration-[var(--duration-tint)] focus-within:border-[var(--semantic-link)]"
        onSubmit={(e) => { e.preventDefault(); send(); }}
      >
        <textarea
          ref={box}
          name="message"
          rows={2}
          value={text}
          disabled={busy}
          placeholder="Paste a URL, or describe what you want to keep an eye on"
          aria-label="What should Assay watch?"
          aria-expanded={menu != null}
          aria-controls={menu ? 'composer-menu' : undefined}
          className="nav-15 w-full resize-none bg-transparent outline-none placeholder:text-[var(--text-muted)] disabled:opacity-60"
          onChange={(e) => change(e.currentTarget)}
          onKeyUp={(e) => setMenu(menuAt(e.currentTarget.value, e.currentTarget.selectionStart))}
          onClick={(e) => setMenu(menuAt(e.currentTarget.value, e.currentTarget.selectionStart))}
          onBlur={() => setMenu(null)}
          onKeyDown={keyDown}
        />

        <div className="flex items-center gap-[10px] pt-[10px]">
          <Sigil icon={<AtSign size={14} strokeWidth={1.5} aria-hidden />} label="data source" onClick={() => insert('@')} />
          <Sigil icon={<Slash size={14} strokeWidth={1.5} aria-hidden />} label="command" onClick={() => insert('/')} />

          <div className="ml-auto flex items-center gap-[10px]">
            <ModelPicker auth={auth} model={model} onModel={onModel} />
            <button
              type="submit"
              disabled={busy || text.trim().length === 0}
              aria-label="Read this page"
              className="press-icon flex size-[32px] items-center justify-center rounded-[8px] bg-[var(--accent-brand)] disabled:opacity-40"
            >
              <ArrowRight size={16} strokeWidth={2} className="text-[var(--accent-on-primary)]" aria-hidden />
            </button>
          </div>
        </div>
      </form>
    </div>
  );

  /**
   * The `@` / `/` buttons. Where the string goes is `insertSigil`'s problem --
   * it is pure and tested; this is the DOM half.
   *
   * `el.selectionStart` and not a piece of state: pressing the button blurs the
   * textarea, and the blur closes the menu but leaves the caret where the
   * operator put it, which is where the sigil belongs.
   */
  function insert(sigil: '@' | '/') {
    const el = box.current;
    if (!el) return;
    const { value, caret } = insertSigil(text, el.selectionStart ?? text.length, sigil);
    setText(value);
    // After the commit, or `setSelectionRange` runs against the old string and
    // React then drops the caret at the end of the new one.
    queueMicrotask(() => {
      el.focus();
      el.setSelectionRange(caret, caret);
      setMenu(menuAt(value, caret));
    });
  }
}

type Row =
  | { kind: 'source'; id: string; title: string; sub: string; held: number; paused: boolean }
  | { kind: 'command'; id: string; title: string; sub: string; href: string };

/** Rows for the open menu. Null sources means "still loading", not "none". */
function matches(menu: Menu, sources: Source[] | null): Row[] {
  const q = menu.query.toLowerCase();
  if (menu.sigil === '/') {
    return COMMANDS.filter((c) => c.name.includes(q))
      .map((c) => ({ kind: 'command' as const, id: c.name, title: `/${c.name}`, sub: c.hint, href: c.href }));
  }
  return (sources ?? [])
    .filter((s) => s.id.toLowerCase().includes(q) || s.url.toLowerCase().includes(q))
    .slice(0, 8)
    .map((s) => ({
      kind: 'source' as const,
      id: s.id,
      title: s.field,
      sub: s.url,
      held: s.held,
      paused: s.paused,
    }));
}

/**
 * The menu, with one highlight that travels between rows rather than each row
 * lighting its own.
 *
 * `onMouseDown` with `preventDefault` rather than `onClick`: the textarea's blur
 * closes the menu, and blur fires before click, so a clicked row would vanish
 * before its handler ran.
 */
function MenuList({
  rows, active, onChoose, sigil,
}: {
  rows: Row[]; active: number; onChoose: (i: number) => void; sigil: '@' | '/';
}) {
  const glide = useGlide<HTMLButtonElement>(rows.length ? active : null, rows.length);

  return (
    <div
      id="composer-menu"
      role="listbox"
      // The menu sits above the box, so it grows out of its own bottom edge --
      // the default centre origin reads as arriving from the middle of nowhere.
      style={{ transformOrigin: 'bottom left' }}
      className="motion-pop-in absolute bottom-[calc(100%+8px)] left-0 z-20 w-full overflow-hidden rounded-[var(--radius-card)] border border-[var(--border-default)] bg-[var(--surface-card)] p-[6px] shadow-[var(--shadow-elevation-floating)]"
    >
      {rows.length === 0 ? (
        // The honest empty state, and the two sigils are empty for different
        // reasons -- so they say different things.
        <p className="meta-12_5 px-[12px] py-[10px] text-[var(--text-secondary)]">
          {sigil === '@'
            ? 'Nothing is under watch yet, so there is no field to point at. Describe a page and Assay will start one.'
            : 'No command matches that.'}
        </p>
      ) : (
        <div className="relative">
          <span
            aria-hidden
            className="absolute left-0 w-full rounded-[var(--radius-control)] bg-[var(--surface-subtle)]"
            style={glide.style}
          />
          {rows.map((r, i) => (
            <button
              key={r.id}
              ref={glide.setRef(i)}
              type="button"
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => { e.preventDefault(); onChoose(i); }}
              className="relative flex w-full items-baseline gap-[10px] rounded-[var(--radius-control)] px-[12px] py-[9px] text-left"
            >
              <span className="mono-value-12_5 shrink-0 text-[var(--text-primary)]">{r.title}</span>
              <span className="caption-12 min-w-0 flex-1 truncate text-[var(--text-secondary)]">{r.sub}</span>
              {r.kind === 'source' && r.held > 0 && (
                // Held is amber everywhere in this product, never danger.
                <span className="caption-11 shrink-0 text-[var(--semantic-warning)]">{r.held} held</span>
              )}
              {r.kind === 'source' && r.paused && (
                <span className="caption-11 shrink-0 text-[var(--text-muted)]">paused</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Sigil({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Insert a ${label}`}
      title={`Insert a ${label}`}
      className="press-icon flex size-[26px] items-center justify-center rounded-[var(--radius-control)] text-[var(--text-muted)] transition-colors duration-[var(--duration-tint)] hover:bg-[var(--surface-subtle)] hover:text-[var(--text-primary)]"
    >
      {icon}
    </button>
  );
}

// --- the model picker --------------------------------------------------------

/**
 * Which model to ask, and which credential is behind it.
 *
 * PRESENCE ONLY, AND THERE IS NOWHERE TO PUT A VALUE. This component is handed
 * one string -- `'api-key' | 'subscription' | 'none'`, or anything a later
 * change adds -- and it never sees, receives or requests a key. That is the same
 * rule `web/app/sign-in/keys.ts` states for the settings panel ("`KeyPresence`
 * has nowhere to put one") and `src/ai/model.ts` repeats: a masked key is still
 * a disclosure. So there is no last-four here, no prefix and no length.
 *
 * `auth` is typed `string`, not a union, on purpose. A third surface is adding a
 * Claude Code CLI login, and an unrecognised state has to degrade to "a
 * credential is configured" rather than crash the home screen or -- worse --
 * silently render as "none" and tell an operator with a working setup that they
 * have none. That exact bug is what 37ee9bd fixed for the subscription token.
 *
 * `modelAuth()` is read in the server component and passed down: that module
 * imports the Agent SDK and pulls Node built-ins, and a `'use client'` import of
 * it drags them into the browser bundle. See `web/components/chrome.ts`.
 */
function ModelPicker({ auth, model, onModel }: { auth: string; model: string; onModel: (m: string) => void }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const shut = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', shut);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', shut); document.removeEventListener('keydown', esc); };
  }, [open]);

  const cred = credential(auth);
  const current = MODELS.find((m) => m === model) ?? MODELS[0];

  return (
    <div ref={wrap} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className="press-row flex items-center gap-[7px] rounded-[var(--radius-control)] px-[9px] py-[6px] transition-colors duration-[var(--duration-tint)] hover:bg-[var(--surface-subtle)]"
      >
        <span className="meta-12_5 text-[var(--text-primary)]">{MODEL_LABEL[current]}</span>
        <ChevronDown size={13} strokeWidth={1.5} className="text-[var(--text-muted)]" aria-hidden />
      </button>

      {open && (
        <div
          role="listbox"
          style={{ transformOrigin: 'bottom right' }}
          className="motion-pop-in absolute bottom-[calc(100%+8px)] right-0 z-30 w-[340px] overflow-hidden rounded-[var(--radius-card)] border border-[var(--border-default)] bg-[var(--surface-card)] p-[6px] shadow-[var(--shadow-elevation-floating)]"
        >
          {MODELS.map((m) => (
            <button
              key={m}
              type="button"
              role="option"
              aria-selected={m === model}
              onClick={() => { onModel(m); setOpen(false); }}
              className="flex w-full items-center gap-[10px] rounded-[var(--radius-control)] px-[10px] py-[8px] text-left transition-colors duration-[var(--duration-tint)] hover:bg-[var(--surface-subtle)]"
            >
              <span className="flex size-[14px] shrink-0 items-center justify-center">
                {m === model && <Check size={13} strokeWidth={2} className="text-[var(--text-primary)]" aria-hidden />}
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="meta-13 text-[var(--text-primary)]">{MODEL_LABEL[m]}</span>
                <span className="caption-11 truncate text-[var(--text-muted)]">{m}</span>
              </span>
              {/* The right-hand column: which credential backs this model. Not
                  a tier badge -- the fact an operator needs here is whether the
                  thing they are about to pick can run at all. */}
              <span className="flex shrink-0 items-center gap-[5px]">
                <cred.Icon size={12} strokeWidth={1.5} style={{ color: cred.colour }} aria-hidden />
                <span className="caption-11" style={{ color: cred.colour }}>{cred.word}</span>
              </span>
            </button>
          ))}

          <p className="caption-11 border-t border-[var(--border-hairline)] px-[10px] pb-[4px] pt-[10px] text-[var(--text-secondary)]">
            {cred.detail}
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * How a credential state renders. Presence and provenance, never a value.
 *
 * The fallthrough is the load-bearing branch: an auth state this build has not
 * heard of is reported as configured-but-unnamed, because the server would not
 * have sent a state at all if there were no credential. Saying "no model" there
 * would repeat the bug 37ee9bd fixed.
 */
function credential(auth: string) {
  if (auth === 'none') {
    return {
      word: 'no key', colour: 'var(--semantic-warning)', Icon: KeyRound,
      detail: 'No model is configured, so Assay cannot read a page and suggest fields. '
        + 'Everything else is unchanged: describe the fields yourself and the gate, the '
        + 'queue and the proof records work exactly as they do with a model.',
    };
  }
  if (auth === 'api-key') {
    return {
      word: 'API key', colour: 'var(--semantic-success)', Icon: KeyRound,
      detail: 'ANTHROPIC_API_KEY is set. Assay reads presence only and never the value.',
    };
  }
  if (auth === 'subscription') {
    return {
      word: 'subscription', colour: 'var(--semantic-success)', Icon: Terminal,
      detail: 'CLAUDE_CODE_OAUTH_TOKEN is set, from `claude setup-token`. '
        + 'Assay reads presence only and never the value.',
    };
  }
  if (auth === 'cli') {
    return {
      word: 'CLI login', colour: 'var(--semantic-success)', Icon: Terminal,
      detail: 'You are logged in to the Claude Code CLI on this machine, and the SDK '
        + 'uses that login. Assay detects it by asking the CLI whether it is '
        + 'authenticated -- there is no token here to read, and none is stored.',
    };
  }
  return {
    word: 'configured', colour: 'var(--semantic-success)', Icon: Check,
    detail: `A credential this build does not have a name for (${auth}) is configured. `
      + 'Assay reads presence only and never the value.',
  };
}
