// The composer's keyboard model, as a pure function.
//
// Its own module so a test can exercise it without a DOM and without parsing
// JSX: deciding whether a menu is open is the only non-obvious logic in the
// composer, and it is the part that breaks silently when someone types an email
// address or pastes a URL with a path in it.

/** Where the caret is, and what the menus need to know about it. */
export interface Menu {
  sigil: '@' | '/';
  /** Index of the sigil in the value. Replacing from here removes the query too. */
  from: number;
  /** What has been typed after the sigil. One token; a space closes the menu. */
  query: string;
}

/**
 * Is a menu open, and what has been typed into it?
 *
 * The sigil counts only at the START OF A WORD. That single rule is what stops
 * `you@example.com` opening the source list and `https://x.com/a/b` opening the
 * command list -- both are common in a box whose whole purpose is receiving
 * pasted URLs, and both would otherwise pop a menu over what the operator is
 * typing.
 *
 * The query excludes `@` and `/` as well as whitespace, so a second sigil starts
 * a new menu rather than extending the first one's query forever.
 */
export function menuAt(value: string, caret: number | null): Menu | null {
  if (caret == null) return null;
  const m = /(^|\s)([@/])([^\s@/]*)$/.exec(value.slice(0, caret));
  if (!m) return null;
  return { sigil: m[2] as '@' | '/', from: caret - m[3]!.length - 1, query: m[3]! };
}

/**
 * What the `@` and `/` buttons do: open that menu at the caret.
 *
 * Opening a menu means putting its sigil in the text, because the text is where
 * `menuAt` reads the state from -- there is no separate mode flag, and there
 * should not be one. The consequence is that the button both opens a menu AND
 * types a character, and that is the whole of the bug this function fixes:
 * clicking `@` three times while looking for a source left `@ @ @` in the
 * message. The operator asked to open the menu three times, not to type three
 * sigils.
 *
 * So a click while that menu is already open at the caret returns the value
 * untouched. The caller still focuses the box and re-reads the menu, which is
 * what the operator wanted -- pressing the button blurs the textarea and closes
 * the menu, so a second press has to be able to bring it back.
 *
 * NOT a debounce. A debounce on a text-insert control makes fast legitimate
 * typing feel broken and leaves the state bug in place: two deliberate clicks a
 * minute apart with the caret still after the sigil are the same mistake as two
 * a moment apart, and are refused for the same reason.
 *
 * The pad keeps the sigil at the start of a word, which is where `menuAt` will
 * look for it: inserting into `foo` has to give `foo @` or the menu it just
 * opened would not be open.
 */
export function insertSigil(
  value: string,
  caret: number,
  sigil: '@' | '/',
): { value: string; caret: number } {
  const open = menuAt(value, caret);
  if (open?.sigil === sigil) return { value, caret };
  const pad = caret > 0 && !/\s$/.test(value.slice(0, caret)) ? ' ' : '';
  return {
    value: `${value.slice(0, caret)}${pad}${sigil}${value.slice(caret)}`,
    caret: caret + pad.length + 1,
  };
}

/**
 * Replace an open menu's sigil and query with a chosen id.
 *
 * Returns the new value and where the caret belongs, so the caller does not
 * recompute an offset that this function already knows.
 */
export function applyChoice(
  value: string,
  menu: Menu,
  id: string,
): { value: string; caret: number } {
  const before = value.slice(0, menu.from);
  const after = value.slice(menu.from + 1 + menu.query.length);
  return {
    value: `${before}@${id} ${after}`,
    caret: before.length + id.length + 2,
  };
}
