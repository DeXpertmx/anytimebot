import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { normalizeCouponCode } from '@/lib/marketing';

export const dynamic = 'force-dynamic';

// POST /api/marketing/coupons — create a coupon (code normalized uppercase).
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const userId = (session.user as any).id as string;

    const body = await request.json();
    const code = normalizeCouponCode(body.code);
    const name = (body.name as string)?.trim() || null;
    const discountType = body.discountType === 'FIXED' ? 'FIXED' : 'PERCENTAGE';
    const discountValue = parseInt(body.discountValue, 10);
    const maxRedemptions = Math.max(0, parseInt(body.maxRedemptions, 10) || 0);

    if (!code) {
      return NextResponse.json({ success: false, error: 'Coupon code is required' }, { status: 400 });
    }
    if (!discountValue || discountValue <= 0) {
      return NextResponse.json({ success: false, error: 'Discount value must be positive' }, { status: 400 });
    }
    if (discountType === 'PERCENTAGE' && discountValue > 100) {
      return NextResponse.json({ success: false, error: 'Percentage cannot exceed 100' }, { status: 400 });
    }

    const existing = await prisma.coupon.findUnique({
      where: { userId_code: { userId, code } },
      select: { id: true },
    });
    if (existing) {
      return NextResponse.json(
        { success: false, error: 'A coupon with that code already exists' },
        { status: 409 },
      );
    }

    const coupon = await prisma.coupon.create({
      data: {
        userId,
        code,
        name,
        discountType,
        discountValue,
        maxRedemptions,
        isActive: body.isActive !== false,
        startsAt: body.startsAt ? new Date(body.startsAt) : null,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
      },
    });

    return NextResponse.json({ success: true, data: coupon });
  } catch (error) {
    console.error('Error creating coupon:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
