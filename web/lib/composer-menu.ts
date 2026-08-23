// The composer's keyboard model, as a pure function.
//
// Its own module so a test can exercise it without a DOM and without parsing
// JSX: deciding whether a menu is open is the only non-obvious logic in the
// composer, and it is the part that breaks silently when someone types an email
// address or pastes a URL with a path in it.
//
// WHAT WENT: `@`. It listed the fields already under watch and inserted the
// chosen id as text, and the id then reached the agent as a long word and
// nothing else -- so picking a scraper and asking about it came back "Which page
// should I watch?", the agent asking for the thing that had just been named. The
// fix was never worth having: one row per FIELD per scraper is hundreds of rows
// on an instance of any size, which is not a picker. It is deleted rather than
// finished, and what replaces it is the agent's own read tools -- the model asks
// the store when it needs to know, instead of the operator hand-feeding it one
// id at a time. `menuAt`'s start-of-word rule survives the removal and still
// earns its place; see below.

export const SHORTCUTS = [
  { id: 'watch', label: 'Watch', placeholder: 'Paste a URL, or describe what you want to keep an eye on' },
  { id: 'research', label: 'Research', placeholder: 'Describe the question you want researched' },
  { id: 'build-api', label: 'Build API', placeholder: 'Describe the web data you want kept available as an API' },
  { id: 'automate', label: 'Automate', placeholder: 'Describe the verified condition and what should follow it' },
  { id: 'compare-locations', label: 'Compare locations', placeholder: 'Describe what to compare, and in which countries' },
  { id: 'ai-visibility', label: 'AI visibility', placeholder: 'Describe the brand, topic, and answers you want observed' },
] as const;

export type ShortcutId = (typeof SHORTCUTS)[number]['id'];

/**
 * The modes actually offered, which is not all of them.
 *
 * SIX WERE DRAWN AND ONE IS THE PRODUCT. "Build API", "Automate", "Compare
 * locations" and "AI visibility" prefix the operator's sentence with a word and
 * change nothing else -- there is no API builder, no automation engine and no
 * visibility report behind them, and `shortcutMessage` is the whole of their
 * implementation. A menu is a promise about what a product does, and four of
 * the six entries were promising things that do not exist. Research stays
 * because the agent genuinely answers questions without building a watch.
 *
 * FILTERED AT RENDER, NEVER DELETED. `SHORTCUTS` is what `shortcutMessage`
 * resolves against and what `LOOK` in `components/composer-shortcuts.tsx` is a
 * `Record` over -- the exhaustiveness check that makes a new mode with no icon
 * a compile error. Cutting rows out of the data would take both, and would
 * strand any conversation whose transcript already carries one of the four.
 *
 * `NEXT_PUBLIC_` because this is read in the browser: Next inlines the value at
 * build time, so the flag is a property of the build and not of the request,
 * which is the right shape for "show me the unfinished ones while I work on
 * them".
 */
const SHIPPED: readonly ShortcutId[] = ['watch', 'research'];

export function visibleShortcuts(): (typeof SHORTCUTS)[number][] {
  return process.env.NEXT_PUBLIC_ASSAY_ALL_MODES === '1'
    ? [...SHORTCUTS]
    : SHORTCUTS.filter((s) => SHIPPED.includes(s.id));
}

/**
 * Put the shortcut into the message channel the composer already owns.
 *
 * This returns one string because there must not be a second agent request
 * shape hiding behind the chips. The readable prefix is also what the
 * transcript records, so a later reader can see the instruction the agent was
 * actually given rather than infer it from vanished client state.
 */
export function shortcutMessage(text: string, selected: ShortcutId | null): string {
  if (!selected) return text;
  const shortcut = SHORTCUTS.find((item) => item.id === selected);
  return shortcut ? `${shortcut.label}: ${text}` : text;
}

/** Where the caret is, and what the command menu needs to know about it. */
export interface Menu {
  /** Index of the `/` in the value. Replacing from here removes the query too. */
  from: number;
  /** What has been typed after it. One token; a space closes the menu. */
  query: string;
}

/**
 * Is the command menu open, and what has been typed into it?
 *
 * The `/` counts only at the START OF A WORD. That single rule is what stops
 * `https://x.com/a/b` opening the command list, which matters in a box whose
 * whole purpose is receiving pasted URLs -- without it a menu pops over what the
 * operator is typing every time they paste a path.
 *
 * The query excludes `/` as well as whitespace, so a second slash starts a new
 * menu rather than extending the first one's query forever.
 */
export function menuAt(value: string, caret: number | null): Menu | null {
  if (caret == null) return null;
  const m = /(^|\s)\/([^\s/]*)$/.exec(value.slice(0, caret));
  if (!m) return null;
  return { from: caret - m[2]!.length - 1, query: m[2]! };
}

/**
 * What the `/` button does: open the command menu at the caret.
 *
 * Opening the menu means putting a `/` in the text, because the text is where
 * `menuAt` reads the state from -- there is no separate mode flag, and there
 * should not be one. The consequence is that the button both opens a menu AND
 * types a character, and that is the whole of the bug this function fixes:
 * clicking it three times while looking for a command left `/ / /` in the
 * message. The operator asked to open the menu three times, not to type three
 * slashes.
 *
 * So a click while the menu is already open at the caret returns the value
 * untouched. The caller still focuses the box and re-reads the menu, which is
 * what the operator wanted -- pressing the button blurs the textarea and closes
 * the menu, so a second press has to be able to bring it back.
 *
 * NOT a debounce. A debounce on a text-insert control makes fast legitimate
 * typing feel broken and leaves the state bug in place: two deliberate clicks a
 * minute apart with the caret still after the slash are the same mistake as two
 * a moment apart, and are refused for the same reason.
 *
 * The pad keeps the slash at the start of a word, which is where `menuAt` will
 * look for it: inserting into `foo` has to give `foo /` or the menu it just
 * opened would not be open.
 */
export function openCommands(value: string, caret: number): { value: string; caret: number } {
  if (menuAt(value, caret)) return { value, caret };
  const pad = caret > 0 && !/\s$/.test(value.slice(0, caret)) ? ' ' : '';
  return {
    value: `${value.slice(0, caret)}${pad}/${value.slice(caret)}`,
    caret: caret + pad.length + 1,
  };
}

/**
 * A slash the operator opened a menu with and then walked away from.
 *
 * The owner sent a transcript reading `@ / @assay-testbed-…`: two sigil buttons
 * pressed while hunting for a picker, and the orphans they left rode into the
 * message and then into the model's prompt as noise. `@` is gone now, and this
 * takes the rest: a `/` with whitespace or nothing on both sides names no
 * command, so it is not a word and is not sent as one.
 *
 * Only bare ones. `/decisions` is a command and `https://x.com/a` is a URL --
 * neither is whitespace-delimited on both sides, and neither is touched.
 */
export function withoutOrphanSlash(text: string): string {
  return text.replace(/(^|\s)\/(?=\s|$)/g, '$1').replace(/[ \t]{2,}/g, ' ').trim();
}
