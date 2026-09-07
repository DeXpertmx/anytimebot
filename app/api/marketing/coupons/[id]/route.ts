import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { normalizeCouponCode } from '@/lib/marketing';

export const dynamic = 'force-dynamic';

// PATCH /api/marketing/coupons/[id] — update (edit values / toggle active).
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const userId = (session.user as any).id as string;

    const existing = await prisma.coupon.findFirst({
      where: { id: params.id, userId },
    });
    if (!existing) {
      return NextResponse.json({ success: false, error: 'Coupon not found' }, { status: 404 });
    }

    const body = await request.json();
    const data: Record<string, unknown> = {};

    if (body.name !== undefined) data.name = (body.name as string)?.trim() || null;
    if (body.isActive !== undefined) data.isActive = !!body.isActive;
    if (body.discountType !== undefined) {
      data.discountType = body.discountType === 'FIXED' ? 'FIXED' : 'PERCENTAGE';
    }
    if (body.discountValue !== undefined) {
      const value = parseInt(body.discountValue, 10);
      if (!value || value <= 0) {
        return NextResponse.json({ success: false, error: 'Discount value must be positive' }, { status: 400 });
      }
      data.discountValue = value;
    }
    if (body.maxRedemptions !== undefined) {
      data.maxRedemptions = Math.max(0, parseInt(body.maxRedemptions, 10) || 0);
    }
    if (body.code !== undefined) {
      const code = normalizeCouponCode(body.code);
      if (!code) {
        return NextResponse.json({ success: false, error: 'Coupon code is required' }, { status: 400 });
      }
      const clash = await prisma.coupon.findFirst({
        where: { userId, code, id: { not: existing.id } },
        select: { id: true },
      });
      if (clash) {
        return NextResponse.json(
          { success: false, error: 'A coupon with that code already exists' },
          { status: 409 },
        );
      }
      data.code = code;
    }
    if (body.startsAt !== undefined) data.startsAt = body.startsAt ? new Date(body.startsAt) : null;
    if (body.expiresAt !== undefined) data.expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;

    const coupon = await prisma.coupon.update({
      where: { id: existing.id },
      data,
    });
    return NextResponse.json({ success: true, data: coupon });
  } catch (error) {
    console.error('Error updating coupon:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/marketing/coupons/[id]
export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const userId = (session.user as any).id as string;

    const existing = await prisma.coupon.findFirst({
      where: { id: params.id, userId },
    });
    if (!existing) {
      return NextResponse.json({ success: false, error: 'Coupon not found' }, { status: 404 });
    }
    await prisma.coupon.delete({ where: { id: existing.id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting coupon:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
