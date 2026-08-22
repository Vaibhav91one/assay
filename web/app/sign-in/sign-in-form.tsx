'use client';

import Image from 'next/image';
import { useActionState } from 'react';
import { ArrowRight, CircleAlert, Mail, UserPlus } from 'lucide-react';
import { IconAlign, Lockup } from './chrome';
import { requestSignIn, type SignInState } from './actions';

export function SignInForm() {
  const [state, submit, pending] = useActionState<SignInState, FormData>(
    requestSignIn,
    { step: 'form' },
  );
  const rejected = state.step === 'unknown';

  return (
    <form action={submit} className="flex flex-col gap-[24px]">
      <Lockup />

      <h2 className="display-44 text-[var(--text-primary)]">Continue to your workspace</h2>

      <div className="flex flex-col gap-[8px]">
        <label htmlFor="email" className="meta-13 text-[var(--text-primary)]">
          Work email
        </label>
        <div
          className={
            rejected
              ? 'flex h-[48px] items-center gap-[10px] rounded-[var(--radius-control)] border-[1.5px] border-[var(--semantic-danger)] bg-[var(--surface-card)] px-[14px]'
              : 'flex h-[48px] items-center gap-[10px] rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--surface-card)] px-[14px] focus-within:border-[var(--semantic-link)]'
          }
        >
          <IconAlign size={14}>
            <Mail
              size={18}
              strokeWidth={1.5}
              className={rejected ? 'text-[var(--semantic-danger)]' : 'text-[var(--text-secondary)]'}
              aria-hidden
            />
          </IconAlign>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            defaultValue={rejected ? state.email : ''}
            placeholder="name@company.com"
            aria-invalid={rejected}
            aria-describedby={rejected ? 'email-error' : undefined}
            className={`body-14 w-full bg-transparent outline-none placeholder:text-[var(--text-muted)] ${
              rejected ? 'text-[var(--semantic-danger)]' : 'text-[var(--text-primary)]'
            }`}
          />
        </div>
      </div>

      {rejected ? (
        <>
          <p id="email-error" role="alert" className="flex items-center gap-[8px]">
            <IconAlign size={12.5}>
              <CircleAlert
                size={16}
                strokeWidth={1.5}
                className="text-[var(--semantic-danger)]"
                aria-hidden
              />
            </IconAlign>
            <span className="meta-12_5 text-[var(--semantic-danger)]">
              I don&rsquo;t recognise this address.
            </span>
          </p>

          <p className="meta-12_5 text-[var(--text-secondary)]">
            Assay is self-hosted &mdash; ask whoever runs your instance, or request access.
          </p>

          {/* Off this instance entirely, and pressed by someone who is part
              way through signing in -- so it opens beside the form rather than
              over it. `noopener` is not optional on a cross-origin `_blank`:
              without it the opened page gets a handle on this one. */}
          <a
            href="https://github.com/assay-dev/assay/issues/new?template=feature.md&title=Request+access"
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-[48px] items-center justify-center gap-[8px] rounded-[var(--radius-control)] bg-[var(--semantic-link)] hover:bg-[var(--semantic-link-hover)]"
          >
            <IconAlign size={14}>
              <UserPlus
                size={16}
                strokeWidth={1.5}
                className="text-[var(--accent-on-primary)]"
                aria-hidden
              />
            </IconAlign>
            <span className="body-14 text-[var(--accent-on-primary)]">Request access</span>
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        </>
      ) : (
        <>
          <button
            type="submit"
            disabled={pending}
            className="flex h-[48px] items-center justify-center gap-[10px] rounded-[var(--radius-control)] bg-[var(--text-primary)] disabled:opacity-60"
          >
            <span className="body-14 text-[var(--text-inverse)]">
              {pending ? 'Sending a link' : 'Continue'}
            </span>
            <IconAlign size={14}>
              <ArrowRight
                size={18}
                strokeWidth={1.5}
                className="text-[var(--text-inverse)]"
                aria-hidden
              />
            </IconAlign>
          </button>

          <div className="flex items-center gap-[12px]">
            <span className="h-px flex-1 bg-[var(--border-default)]" />
            <span className="caption-12 text-[var(--text-primary)]">or</span>
            <span className="h-px flex-1 bg-[var(--border-default)]" />
          </div>

          <button
            type="submit"
            name="provider"
            value="google"
            disabled={pending}
            className="flex h-[48px] items-center justify-center gap-[10px] rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--surface-card)] hover:bg-[var(--surface-subtle)] disabled:opacity-60"
          >
            <IconAlign size={14}>
              <Image src="/brand/google.svg" alt="" width={18} height={18} />
            </IconAlign>
            <span className="body-14 text-[var(--text-primary)]">Continue with Google</span>
          </button>

          <button
            type="submit"
            name="provider"
            value="github"
            disabled={pending}
            className="flex h-[48px] items-center justify-center gap-[10px] rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--surface-card)] hover:bg-[var(--surface-subtle)] disabled:opacity-60"
          >
            <IconAlign size={14}>
              <Image src="/brand/github.svg" alt="" width={18} height={18} />
            </IconAlign>
            <span className="body-14 text-[var(--text-primary)]">Continue with GitHub</span>
          </button>

          <p className="caption-12 text-[var(--text-secondary)]">
            Don&rsquo;t have an account?{' '}
            <a
              href="https://github.com/assay-dev/assay/issues/new?template=feature.md&title=Request+access"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--semantic-link)] hover:text-[var(--semantic-link-hover)]"
            >
              Request access
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          </p>
        </>
      )}
    </form>
  );
}
