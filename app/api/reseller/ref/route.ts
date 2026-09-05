import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getResellerBySlug, RESELLER_REF_COOKIE } from '@/lib/resellers';

export const dynamic = 'force-dynamic';

// GET /api/reseller/ref?ref=acme
// Validates the ref, sets a persistent attribution cookie, and if the visitor
// is already signed in without a reseller, assigns the reseller immediately
// (covers Google sign-ins where the signup API is not used).
export async function GET(request: NextRequest) {
  const ref = request.nextUrl.searchParams.get('ref') || '';
  const reseller = ref ? await getResellerBySlug(ref) : null;

  if (!reseller) {
    return NextResponse.json({ ok: false, error: 'Invalid ref' }, { status: 404 });
  }

  // Assign the reseller to a signed-in user that does not have one yet.
  const session = await getServerSession(authOptions);
  if (session?.user?.id) {
    try {
      await prisma.user.updateMany({
        where: { id: session.user.id, resellerId: null },
        data: { resellerId: reseller.id },
      });
    } catch (e) {
      console.warn('Could not attribute signed-in user to reseller:', e);
    }
  }

  const response = NextResponse.json({ ok: true, slug: reseller.slug, name: reseller.name });
  response.cookies.set(RESELLER_REF_COOKIE, reseller.slug, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 90, // 90 days attribution window
  });

  return response;
}

// DELETE /api/reseller/ref - clear the attribution cookie (for logout).
export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(RESELLER_REF_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  });
  return response;
}