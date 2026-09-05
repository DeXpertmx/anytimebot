import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const admin = await prisma.user.findUnique({ where: { id: session.user.id }, select: { role: true } });
  if (admin?.role !== 'ADMIN') return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const data: Record<string, unknown> = {};

  if (typeof body.discountPercent === 'number') {
    data.discountPercent = Math.min(Math.max(Math.round(body.discountPercent), 0), 100);
  }
  if (typeof body.isActive === 'boolean') {
    data.isActive = body.isActive;
  }
  if (typeof body.contactEmail === 'string') {
    data.contactEmail = body.contactEmail.trim() || null;
  }

  // Link or unlink the owner account (the user that manages the reseller panel).
  // Empty string unlinks; otherwise the account must already exist in Anytimebot.
  if (typeof body.ownerEmail === 'string') {
    const ownerEmail = body.ownerEmail.trim().toLowerCase();
    if (!ownerEmail) {
      data.ownerUserId = null;
    } else {
      const owner = await prisma.user.findFirst({
        where: { email: { equals: ownerEmail, mode: 'insensitive' } },
        select: { id: true },
      });
      if (!owner) {
        return NextResponse.json({ error: 'No existe ningún usuario con ese email. La persona debe registrarse primero en Anytimebot.' }, { status: 400 });
      }
      const ownedByOther = await prisma.reseller.findFirst({
        where: { ownerUserId: owner.id, id: { not: params.id } },
        select: { id: true },
      });
      if (ownedByOther) {
        return NextResponse.json({ error: 'Ese usuario ya gestiona otro reseller' }, { status: 409 });
      }
      data.ownerUserId = owner.id;
    }
  }

  const reseller = await prisma.reseller.update({ where: { id: params.id }, data });
  return NextResponse.json({ ok: true, id: reseller.id });
}