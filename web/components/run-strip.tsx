/**
 * One bar per run, oldest left.
 *
 * Shared by home and Runs because it is the same idiom in both: a run that
 * held something is taller and amber, so a held run is findable at a glance in
 * a row of sixty. Clean runs are deliberately the quiet ones.
 */
export interface Bar {
  runId: number;
  held: boolean;
}

export function RunStrip({
  bars,
  label,
  from,
  to,
}: {
  bars: Bar[];
  label?: string;
  from?: string;
  to?: string;
}) {
  if (bars.length === 0) return null;

  return (
    <div className="flex flex-col gap-[6px]">
      {label && <p className="label-10 text-[var(--text-muted)]">{label}</p>}
      <div className="flex items-end gap-[5px]">
        {bars.map((b) => (
          <span
            key={b.runId}
            title={`run ${b.runId}${b.held ? ' — held' : ''}`}
            className="w-[3px] rounded-[1px]"
            style={{
              height: b.held ? 26 : 18,
              background: b.held ? 'var(--semantic-warning)' : 'var(--accent-brand)',
            }}
          />
        ))}
      </div>
      {(from || to) && (
        <div className="flex justify-between">
          <span className="caption-11 text-[var(--text-muted)]">{from}</span>
          <span className="caption-11 text-[var(--text-muted)]">{to}</span>
        </div>
      )}
    </div>
  );
}
