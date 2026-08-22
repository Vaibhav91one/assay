import type { Metadata } from 'next';
import Link from 'next/link';
import { MailCheck } from 'lucide-react';
import { CardHalf, Headline } from '../chrome';

export const metadata: Metadata = { title: 'Check your email · Assay' };

/**
 * The link has been sent. Its own route rather than a flag on /sign-in,
 * because it is a different place: reloading it must not re-send anything,
 * and the back button should go to the form.
 */
export default async function CheckEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ to?: string }>;
}) {
  const { to } = await searchParams;

  return (
    <main className="flex min-h-screen items-stretch bg-[var(--bg-page)]">
      <Headline />
      <CardHalf>
        <div className="flex flex-col gap-[24px]">
          <div className="flex justify-center">
            <MailCheck
              size={28}
              strokeWidth={1.5}
              className="text-[var(--semantic-success)]"
              aria-hidden
            />
          </div>

          <h2 className="display-28 text-center text-[var(--text-primary)]">Check your email.</h2>

          <p className="body-13_5 text-[var(--text-secondary)]">
            {to ? (
              <>
                I sent a sign-in link to{' '}
                <span className="text-[var(--text-primary)]">{to}</span>. It works for 15 minutes.
              </>
            ) : (
              <>I sent a sign-in link. It works for 15 minutes.</>
            )}
          </p>

          <p className="meta-12_5 text-[var(--text-secondary)]">
            The link is in your inbox &mdash; there is nothing to click here.
          </p>

          <Link
            href="/sign-in"
            className="meta-12_5 text-right text-[var(--semantic-link)] hover:text-[var(--semantic-link-hover)]"
          >
            use a different email &rsaquo;
          </Link>
        </div>
      </CardHalf>
    </main>
  );
}
