import type { LucideIcon } from 'lucide-react';
import { Check, CircleAlert, CircleX, Clock } from 'lucide-react';

/**
 * A status word with the glyph that means it. Colour AND glyph always agree,
 * which is the whole point: the palette carries no alarm red on its own, so
 * severity is read off the pair, never off a fill.
 *
 * `info` is deliberately glyphless -- an ambient fact ("clean", "3 runs
 * skipped") that demands nothing should not carry a mark that says look here.
 */
export type Tone = 'info' | 'success' | 'warning' | 'danger' | 'motion';

const TONE: Record<Tone, { colour: string; icon: LucideIcon | null }> = {
  info: { colour: 'var(--text-secondary)', icon: null },
  success: { colour: 'var(--semantic-success)', icon: Check },
  warning: { colour: 'var(--semantic-warning)', icon: CircleAlert },
  danger: { colour: 'var(--semantic-danger)', icon: CircleX },
  motion: { colour: 'var(--semantic-link)', icon: Clock },
};

export function StatusLine({
  tone = 'info',
  icon,
  size = 15,
  type = 'body-13_5',
  /** Text drops to muted while the glyph keeps its tone. Most runs are clean,
      and a wall of green shouting as loudly as a held cell is how a held cell
      gets missed. */
  muted = false,
  className = '',
  children,
}: {
  tone?: Tone;
  /** Override the glyph where the verb is more specific than the tone. */
  icon?: LucideIcon | null;
  size?: number;
  type?: string;
  muted?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const { colour, icon: fallback } = TONE[tone];
  const Icon = icon === undefined ? fallback : icon;

  return (
    <span className={`flex items-center gap-[8px] ${className}`}>
      {Icon && <Icon size={size} strokeWidth={1.5} style={{ color: colour }} aria-hidden />}
      <span className={type} style={{ color: muted ? 'var(--text-muted)' : colour }}>
        {children}
      </span>
    </span>
  );
}
