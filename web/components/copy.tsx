'use client';

import { useEffect, useState } from 'react';
import { Toast } from '@/components/toast';

/**
 * Copy something to the clipboard and say so.
 *
 * Copying is reversible by definition -- nothing happened to the data -- so it
 * gets a toast and no undo. The receipt names *what* was copied, because
 * "Copied" alone leaves the reader to guess which of the three copy controls
 * on the screen they hit.
 */
export function Copy({
  text,
  receipt,
  className,
  children,
}: {
  text: string;
  receipt: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  const [shown, setShown] = useState(false);
  const [failed, setFailed] = useState(false);

  // 8 seconds, per the overlay convention. Cleared on unmount so a fast
  // navigation cannot leave a timer holding a dead setState.
  useEffect(() => {
    if (!shown) return;
    const t = setTimeout(() => setShown(false), 8000);
    return () => clearTimeout(t);
  }, [shown]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setFailed(false);
    } catch {
      // The clipboard is denied over plain http and in some embeddings. That
      // is a failure of the action, and it lands where the action started.
      setFailed(true);
    }
    setShown(true);
  }

  return (
    <>
      <button type="button" onClick={copy} className={className}>
        {children}
      </button>
      {shown &&
        (failed ? (
          <Toast variant="error" message="The browser would not give up the clipboard." />
        ) : (
          <Toast message={receipt} />
        ))}
    </>
  );
}
