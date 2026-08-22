// Class names shared by server chrome and client controls.
//
// Its own module on purpose: `TOP_BAR_ACTION` used to live in `top-bar.tsx`,
// and the moment a client component imported it, the whole of that module came
// with it -- including the notifications query, and so `pg`, and so `net`,
// `tls` and `dns` into the browser bundle. A constant with no imports cannot
// drag a database into the client.

/** The outlined right-hand control, so any action matches the default. */
export const TOP_BAR_ACTION =
  'flex shrink-0 items-center gap-[8px] rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--surface-card)] py-[8px] pl-[12px] pr-[14px] hover:bg-[var(--surface-subtle)]';
