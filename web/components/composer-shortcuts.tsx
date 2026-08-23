import { SHORTCUTS, type ShortcutId } from '@/lib/composer-menu';

/**
 * Presentation shortcuts for the one composer, not destinations or products.
 *
 * There is deliberately no Link, router, form submission, or history call in
 * this component. A mode changes the instruction carried by the existing text
 * request; giving a chip its own navigation would create the second workflow
 * the unified composer was meant to avoid. Preventing pointer focus transfer
 * keeps the caret in the writing surface while `Composer` restores it for
 * keyboard and touch activation.
 */
export function ComposerShortcuts({
  selected,
  onSelect,
}: {
  selected: ShortcutId | null;
  onSelect: (shortcut: ShortcutId) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Composer mode"
      className="mt-[14px] flex w-full gap-[7px] overflow-x-auto pb-[2px]"
    >
      {SHORTCUTS.map((shortcut) => (
        <button
          key={shortcut.id}
          type="button"
          aria-pressed={selected === shortcut.id}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onSelect(shortcut.id)}
          className={[
            'meta-12_5 shrink-0 rounded-full border px-[11px] py-[6px]',
            'transition-colors duration-[var(--duration-tint)]',
            selected === shortcut.id
              ? 'border-[var(--text-primary)] bg-[var(--text-primary)] text-[var(--surface-card)]'
              : 'border-[var(--border-default)] text-[var(--text-secondary)] hover:border-[var(--text-muted)] hover:text-[var(--text-primary)]',
          ].join(' ')}
        >
          {shortcut.label}
        </button>
      ))}
    </div>
  );
}
