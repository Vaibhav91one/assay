/**
 * The frozen page (Figma `decisions · frozen page` 413:2964, and `page-map`
 * 409:2736's before/after pair uses two of these side by side).
 *
 * Deliberately not `'use client'` -- same rule as `proof-detail.tsx`: no
 * interactivity here beyond what an `<iframe>` already gives for free, so it
 * renders identically on the server for a route and in the client bundle for
 * a sheet.
 *
 * `sandbox="allow-same-origin"` and NOTHING ELSE -- specifically never
 * `allow-scripts`. This is untrusted third-party HTML; the candidate boxes
 * are drawn server-side before the bytes ever reach this iframe (see
 * `annotateCapture` in `src/store/captures.ts`), so no client-side
 * postMessage protocol is needed and no script from the captured page can run
 * even if one somehow survived stripping.
 */
export function CaptureView({
  sha,
  candidates,
  baseUrl,
  height = 480,
  className,
}: {
  sha: string;
  candidates?: { selector: string; label: string }[];
  baseUrl?: string | null;
  height?: number;
  className?: string;
}) {
  const params = new URLSearchParams();
  for (const c of candidates ?? []) params.append('box', `${c.label}::${c.selector}`);
  if (baseUrl) params.set('base', baseUrl);
  const qs = params.toString();

  return (
    <div
      className={`overflow-hidden rounded-[var(--radius-card)] border border-[var(--border-default)] bg-[var(--surface-subtle)] ${className ?? ''}`}
      style={{ height }}
    >
      <iframe
        src={`/api/captures/${sha}${qs ? `?${qs}` : ''}`}
        sandbox="allow-same-origin"
        title="Captured page"
        className="size-full border-0"
      />
    </div>
  );
}
