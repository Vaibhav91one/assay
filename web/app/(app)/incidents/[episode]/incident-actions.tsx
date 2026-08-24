'use client';

import { useState } from 'react';
import { Download, Link as LinkIcon } from 'lucide-react';
import { actionVariants } from '@/components/button';
import { Toast } from '@/components/toast';

/**
 * "Download PDF" and "Copy link" (Figma 435:2). PDF is `window.print()` +
 * `@media print` (app/globals.css) -- the browser's own print-to-PDF is the
 * whole mechanism, deliberately not a PDF-generation dependency.
 */
export function IncidentActions({ episode }: { episode: number }) {
  const [copied, setCopied] = useState(false);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 8000);
    } catch {
      // Denied clipboard access is a real failure mode over plain http and in
      // some embeddings; the link is still selectable in the address bar.
    }
  }

  return (
    <span className="flex items-center gap-[8px]">
      <button type="button" onClick={copyLink} className={actionVariants({ variant: 'outline' })}>
        <LinkIcon size={16} strokeWidth={1.5} aria-hidden />
        Copy link
      </button>
      <button type="button" onClick={() => window.print()} className={actionVariants({ variant: 'outline' })}>
        <Download size={16} strokeWidth={1.5} aria-hidden />
        Download PDF
      </button>
      {copied && <Toast message={<>Copied a link to episode {episode}</>} />}
    </span>
  );
}
