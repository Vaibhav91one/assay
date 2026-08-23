'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Braces, ChevronDown, Eye, Globe, Sparkles, Telescope, Zap, type LucideIcon,
} from 'lucide-react';
import { SHORTCUTS, type ShortcutId } from '@/lib/composer-menu';

/**
 * Which mode the composer is in, as a dropdown.
 *
 * IT WAS A ROW OF SIX CHIPS. Six is already a full line on a narrow window and
 * the row scrolled sideways under the message box, which put the two rightmost
 * modes -- and the fact that a mode was selected at all -- off screen. A menu
 * shows the current one always and the other five on demand, which is the
 * information an operator actually needs from this control.
 *
 * There is deliberately no Link, router, form submission, or history call in
 * this component. A mode changes the instruction carried by the existing text
 * request; giving an option its own navigation would create the second workflow
 * the unified composer was meant to avoid. Preventing pointer focus transfer
 * keeps the caret in the writing surface while `Composer` restores it for
 * keyboard and touch activation.
 *
 * `aria-pressed` on the options rather than `role="listbox"`, and that is a
 * choice about what these are. A listbox option is a value being picked out of a
 * set; these are toggles that stay legible when the menu is shut, they carry the
 * pressed state the chips carried, and the trigger is not a combobox for a form
 * field. A group of toggle buttons in a popover is what this is, so that is what
 * it says it is.
 *
 * The dropdown is opened and closed the way `ModelPicker` in
 * `web/app/(app)/composer.tsx` does -- outside mousedown, Escape, `motion-pop-in`
 * on the panel -- because it sits eight pixels away from it in the same box and a
 * second popover behaving differently would be felt before it was noticed.
 */

/**
 * One icon and one colour per mode.
 *
 * A `Record<ShortcutId, ...>`, so a seventh mode in `SHORTCUTS` is a compile
 * error here rather than a mode that silently renders with no icon -- the same
 * device `MODEL_LABEL` uses for model names.
 *
 * THE PALETTE HAS FIVE HUES AND SIX MODES. `web/app/tokens.css` is generated
 * from the Figma file and is not edited by hand, so inventing a seventh colour
 * here would be a hex that no design owns and that no dark theme would follow.
 * `--semantic-danger` is spent on failure everywhere in this product and a mode
 * is not a failure, which leaves four hues -- so the last two modes take the ink
 * and the grey rather than a colour that means something else. If six distinct
 * hues are wanted, the honest fix is a mode ramp added in Figma and regenerated
 * through `tools/tokens.js`, not a literal in this file.
 */
const LOOK: Record<ShortcutId, { Icon: LucideIcon; tone: string }> = {
  // The owner's own example: "watch should have a watch blue icon".
  watch: { Icon: Eye, tone: 'var(--semantic-link)' },
  research: { Icon: Telescope, tone: 'var(--accent-brand)' },
  'build-api': { Icon: Braces, tone: 'var(--semantic-success)' },
  automate: { Icon: Zap, tone: 'var(--semantic-warning)' },
  'compare-locations': { Icon: Globe, tone: 'var(--text-primary)' },
  'ai-visibility': { Icon: Sparkles, tone: 'var(--text-secondary)' },
};

export function ComposerShortcuts({
  selected,
  onSelect,
}: {
  selected: ShortcutId | null;
  onSelect: (shortcut: ShortcutId) => void;
}) {
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

  const current = SHORTCUTS.find((s) => s.id === selected) ?? null;
  const look = current ? LOOK[current.id] : null;

  return (
    <div ref={wrap} className="relative mt-[14px] w-fit" role="group" aria-label="Composer mode">
      <button
        type="button"
        // The trigger must not take the caret either: the operator opens this
        // mid-sentence and the sentence is still being written.
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="true"
        className="press-row flex items-center gap-[8px] rounded-full border border-[var(--border-default)] px-[11px] py-[6px] transition-colors duration-[var(--duration-tint)] hover:border-[var(--text-muted)]"
      >
        {look ? (
          <look.Icon size={14} strokeWidth={1.5} style={{ color: look.tone }} aria-hidden />
        ) : (
          // No mode is a real state -- the composer starts in it and it means
          // "just answer what I typed" -- so it gets a word rather than an icon
          // borrowed from one of the six.
          <span className="size-[14px]" aria-hidden />
        )}
        <span className="meta-12_5 text-[var(--text-primary)]">{current?.label ?? 'Mode'}</span>
        <ChevronDown size={13} strokeWidth={1.5} className="text-[var(--text-muted)]" aria-hidden />
      </button>

      {open && (
        <div
          // Grows out of the edge it is attached to. `motion-pop-in` is the
          // product's popover arrival -- `--duration-pop` on `--ease-pop`, and
          // the reduced-motion query takes it -- so there is no duration here.
          style={{ transformOrigin: 'top left' }}
          className="motion-pop-in absolute left-0 top-[calc(100%+8px)] z-30 w-[240px] overflow-hidden rounded-[var(--radius-card)] border border-[var(--border-default)] bg-[var(--surface-card)] p-[6px] shadow-[var(--shadow-elevation-floating)]"
        >
          {SHORTCUTS.map((shortcut) => {
            const { Icon, tone } = LOOK[shortcut.id];
            return (
              <button
                key={shortcut.id}
                type="button"
                aria-pressed={selected === shortcut.id}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => { onSelect(shortcut.id); setOpen(false); }}
                className={[
                  'flex w-full items-center gap-[10px] rounded-[var(--radius-control)] px-[10px] py-[8px] text-left',
                  'transition-colors duration-[var(--duration-tint)] hover:bg-[var(--surface-subtle)]',
                  selected === shortcut.id ? 'bg-[var(--surface-subtle)]' : '',
                ].join(' ')}
              >
                <Icon size={15} strokeWidth={1.5} style={{ color: tone }} aria-hidden />
                <span className="meta-13 flex-1 text-[var(--text-primary)]">{shortcut.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
