/**
 * Nothing here, and why that is not a failure.
 *
 * Empty, loading and unreachable are three different things and they look like
 * three different things. This one is the settled state: the query ran, it
 * came back, and the answer is none -- so it is a card with a sentence, not a
 * spinner and not a warning.
 */
export function Empty({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="flex w-full flex-col gap-[8px] rounded-[var(--radius-card)] border border-[var(--border-default)] bg-[var(--surface-card)] px-[24px] py-[20px]">
      <p className="heading-18 text-[var(--text-primary)]">{title}</p>
      {children && <p className="body-13_5 text-[var(--text-secondary)]">{children}</p>}
    </div>
  );
}
