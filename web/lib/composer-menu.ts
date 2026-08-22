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
