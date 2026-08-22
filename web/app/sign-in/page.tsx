import type { Metadata } from 'next';
import { CardHalf, Headline } from './chrome';
import { SignInForm } from './sign-in-form';

export const metadata: Metadata = { title: 'Sign in · Assay' };

export default function SignInPage() {
  return (
    <main className="flex min-h-screen items-stretch bg-[var(--bg-page)]">
      <Headline />
      <CardHalf>
        <SignInForm />
      </CardHalf>
    </main>
  );
}
