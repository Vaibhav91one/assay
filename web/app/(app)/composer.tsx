'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, ChevronDown, CircleAlert, KeyRound, Slash, Terminal } from 'lucide-react';
import { useGlide } from '@/components/motion/glide';
import { ComposerShortcuts } from '@/components/composer-shortcuts';
import { MODELS, MODEL_LABEL } from 'assay/engine/agent/models';
import { COMMANDS, commandIn, type CommandName } from 'assay/engine/store/conversation-log';
import {
  SHORTCUTS, menuAt, openCommands, shortcutMessage, withoutOrphanSlash,
  type Menu, type ShortcutId,
} from '@/lib/composer-menu';
import { t } from '@/lib/copy';

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
 * There is no `@` any more. It listed every watched field and inserted the id as
 * text, which the agent then received as a long word -- so naming a scraper and
 * asking about it came back "Which page should I watch?". Finishing it would have
 * produced a picker with one row per field per scraper, which is not a picker on
 * any instance of size. See `web/lib/composer-menu.ts`.
 *
 * `/` LISTS IN THE CHAT AND DOES NOT NAVIGATE. It used to `router.push` to four
 * screens, which answered the question by leaving the conversation. Now the
 * command becomes a turn that reads the store live every time it is rendered,
 * and a held cell can be answered where it is read. The command names are a
 * closed set in `src/store/conversation-log.ts`; anything else is refused by
 * name, here, before it reaches a read.
 */

export function Composer({
  auth,
  model,
  onModel,
  onSubmit,
  onCommand,
  busy,
}: {
  /** Resolved on the server by `modelAuth()`. A string, so a new state cannot crash this. */
  auth: string;
  model: string;
  onModel: (m: string) => void;
  onSubmit: (text: string) => void;
  /** Run a command in the transcript. Never a navigation -- see the header. */
  onCommand: (name: CommandName, args: string) => void;
  busy: boolean;
}) {
  const box = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState('');
  const [menu, setMenu] = useState<Menu | null>(null);
  const [active, setActive] = useState(0);
  const [mode, setMode] = useState<ShortcutId | null>(null);
  /**
   * A refusal the operator can see, and the text stays in the box behind it.
   *
   * Not a turn and not a toast. A mistyped command is not a thing that happened
   * to the conversation -- writing it into the transcript would put a permanent
   * record of a typo next to the questions that were really asked -- and a toast
   * that fades takes the explanation with it while the wrong text is still in the
   * box. This clears on the next keystroke, which is the operator fixing it.
   */
  const [refused, setRefused] = useState<string | null>(null);

  const rows = menu ? matches(menu) : [];
  useEffect(() => { setActive(0); }, [menu?.query]);

  function grow(el: HTMLTextAreaElement) {
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 240)}px`;
  }

  /** Re-read the caret after every change: that is what decides if a menu is open. */
  function change(el: HTMLTextAreaElement) {
    setText(el.value);
    setRefused(null);
    grow(el);
    setMenu(menuAt(el.value, el.selectionStart));
  }

  /**
   * Picking a command RUNS it, rather than completing the word.
   *
   * The menu used to insert an id and the `/` rows used to navigate; a command
   * is neither. What the operator asked for is the list, so they get the list --
   * in the transcript, from a live read.
   *
   * Only the `/dec` that opened the menu comes out of the box. Anything typed
   * around it stays: the operator was writing a message and reached for a
   * command mid-sentence, and eating the sentence would be the router.push this
   * replaced, wearing different clothes.
   */
  function choose(i: number) {
    const row = rows[i];
    if (!row || !menu) return;
    const rest = `${text.slice(0, menu.from)}${text.slice(menu.from + 1 + menu.query.length)}`;
    run(row.name, '', rest);
  }

  /** One place a command starts from, whether it was picked or typed. */
  function run(name: CommandName, args: string, keep = '') {
    setMenu(null);
    setRefused(null);
    setText(withoutOrphanSlash(keep));
    if (box.current) box.current.style.height = 'auto';
    onCommand(name, args);
    queueMicrotask(() => box.current?.focus());
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

  /**
   * Send, or run a command, or refuse one that does not exist.
   *
   * THE THIRD BRANCH IS THE POINT. A message beginning with `/` is a command
   * attempt -- nothing else in this box starts with a slash, because a URL
   * starts with its scheme -- so a name that is not one of the four is answered
   * with the four rather than posted to the agent as a sentence. An operator who
   * mistypes gets told; an operator trying to find a fifth command learns there
   * is not one. Neither case reaches a read.
   */
  function send() {
    const written = withoutOrphanSlash(text);
    if (!written || busy) return;

    const typed = commandIn(written);
    if (typed.kind === 'unknown') { setRefused(t('command.unknown')); return; }
    if (typed.kind === 'command') { run(typed.name, typed.args); return; }

    onSubmit(shortcutMessage(written, mode));
    setText('');
    setMenu(null);
    setRefused(null);
    if (box.current) box.current.style.height = 'auto';
  }

  return (
    <div className="relative w-full">
      {menu && <MenuList rows={rows} active={active} onChoose={choose} />}

      {refused && (
        // `alert`, and it sits above the box where the command was typed. The
        // text is still in the box behind it, which is the other half of saying
        // no out loud: the operator can see what they wrote and fix it.
        <p
          role="alert"
          className="motion-pop-in mb-[8px] flex items-start gap-[8px] rounded-[var(--radius-control)] border border-[var(--semantic-warning)] bg-[var(--semantic-warning-subtle)] px-[12px] py-[9px]"
        >
          <CircleAlert size={14} strokeWidth={1.5} className="mt-[1px] shrink-0 text-[var(--semantic-warning)]" aria-hidden />
          <span className="caption-12 leading-[1.45] text-[var(--text-secondary)]">{refused}</span>
        </p>
      )}

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
          placeholder={SHORTCUTS.find((shortcut) => shortcut.id === mode)?.placeholder
            ?? 'Paste a URL, or describe what you want to keep an eye on'}
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

        <ComposerShortcuts selected={mode} onSelect={selectShortcut} />

        <div className="flex items-center gap-[10px] pt-[10px]">
          <Sigil icon={<Slash size={14} strokeWidth={1.5} aria-hidden />} label="command" onClick={insert} />

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
   * The `/` button. Where the string goes is `openCommands`' problem -- it is
   * pure and tested; this is the DOM half.
   *
   * `el.selectionStart` and not a piece of state: pressing the button blurs the
   * textarea, and the blur closes the menu but leaves the caret where the
   * operator put it, which is where the slash belongs.
   */
  function insert() {
    const el = box.current;
    if (!el) return;
    const { value, caret } = openCommands(text, el.selectionStart ?? text.length);
    setText(value);
    // After the commit, or `setSelectionRange` runs against the old string and
    // React then drops the caret at the end of the new one.
    queueMicrotask(() => {
      el.focus();
      el.setSelectionRange(caret, caret);
      setMenu(menuAt(value, caret));
    });
  }

  /**
   * Change only the instruction layered over the text already in the box.
   * `setText` is deliberately absent: choosing a mode is not editing. The
   * microtask covers keyboard and touch activation, while the chip's prevented
   * mousedown keeps pointer focus from leaving the textarea in the first place.
   */
  function selectShortcut(shortcut: ShortcutId) {
    setMode(shortcut);
    setMenu(null);
    queueMicrotask(() => box.current?.focus());
  }
}

interface Row { name: CommandName; title: string; sub: string }

/**
 * Rows for the open menu: the four commands, filtered by what has been typed.
 *
 * No fetch and nothing to load. The list is `COMMANDS`, which is a compile-time
 * constant, so the menu cannot be empty for a reason the operator has to guess
 * at -- an empty menu here means the query matches none of four names.
 */
function matches(menu: Menu): Row[] {
  const q = menu.query.toLowerCase();
  return COMMANDS.filter((name) => name.includes(q)).map((name) => ({
    name,
    title: `/${name}`,
    sub: t(`command.${name}.hint`),
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
  rows, active, onChoose,
}: {
  rows: Row[]; active: number; onChoose: (i: number) => void;
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
        <p className="meta-12_5 px-[12px] py-[10px] text-[var(--text-secondary)]">
          {t('home.composer.noCommand')}
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
              key={r.name}
              ref={glide.setRef(i)}
              type="button"
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => { e.preventDefault(); onChoose(i); }}
              className="relative flex w-full items-baseline gap-[10px] rounded-[var(--radius-control)] px-[12px] py-[9px] text-left"
            >
              <span className="mono-value-12_5 shrink-0 text-[var(--text-primary)]">{r.title}</span>
              <span className="caption-12 min-w-0 flex-1 truncate text-[var(--text-secondary)]">{r.sub}</span>
              {/* No count on the row, deliberately. It would have to be read
                  before the menu could open, and it would be a number from the
                  moment the menu was drawn sitting next to a panel that re-reads
                  on every render -- two answers to "how many are waiting" eight
                  pixels apart. The panel is the one that is right. */}
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
