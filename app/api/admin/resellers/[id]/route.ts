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

  const reseller = await prisma.reseller.update({ where: { id: params.id }, data });
  return NextResponse.json({ ok: true, id: reseller.id });
}