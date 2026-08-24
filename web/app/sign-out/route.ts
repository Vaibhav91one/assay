import { NextResponse, type NextRequest } from 'next/server';
import { authMode, signOutCurrentSession } from '@/lib/auth';

/**
 * Sign out, hosted only. All the Clerk-specific work lives in
 * `signOutCurrentSession()` (`lib/auth.ts`) -- see that function's header and
 * `test/auth.test.ts`'s "is the only module that names Clerk" for why this
 * file must not import the Clerk SDK package itself.
 */
export async function POST(request: NextRequest) {
  if (authMode() !== 'clerk') return NextResponse.json({ error: 'not_applicable' }, { status: 404 });

  await signOutCurrentSession();

  return NextResponse.redirect(new URL(process.env.NEXT_PUBLIC_CLERK_SIGN_IN_URL || '/sign-in', request.url));
}
