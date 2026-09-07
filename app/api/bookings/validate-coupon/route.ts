import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import {
  findRedeemableCoupon,
  computeCouponDiscount,
  normalizeCouponCode,
  type CouponError,
} from '@/lib/marketing';

export const dynamic = 'force-dynamic';

const ERROR_MESSAGES: Record<CouponError | 'NOT_FOUND' | 'NOT_APPLICABLE', string> = {
  NOT_FOUND: 'El código no es válido',
  INACTIVE: 'El código no está activo',
  NOT_STARTED: 'El código aún no está disponible',
  EXPIRED: 'El código ha caducado',
  LIMIT_REACHED: 'El código ya ha agotado sus usos',
  NOT_APPLICABLE: 'Los cupones no se aplican a suscripciones recurrentes',
};

/**
 * POST /api/bookings/validate-coupon — public. Validates a promo code for a
 * one-time paid booking (or a combined multi-service block) and returns the
 * discount in cents so the public page can preview it before Checkout. No PII.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { eventTypeId, eventTypeIds } = body;
    const code = normalizeCouponCode(body.code);

    if (!code) {
      return NextResponse.json({ success: false, error: ERROR_MESSAGES.NOT_FOUND }, { status: 400 });
    }

    const serviceIds =
      Array.isArray(eventTypeIds) && eventTypeIds.length > 0
        ? eventTypeIds
        : eventTypeId
          ? [eventTypeId]
          : [];
    if (serviceIds.length === 0) {
      return NextResponse.json({ success: false, error: 'Event type not found' }, { status: 404 });
    }

    const eventTypes = await prisma.eventType.findMany({
      where: { id: { in: serviceIds } },
      include: { bookingPage: { select: { userId: true } } },
    });
    if (eventTypes.length === 0) {
      return NextResponse.json({ success: false, error: 'Event type not found' }, { status: 404 });
    }

    const userId = eventTypes[0].bookingPage.userId;
    const total = eventTypes
      .filter((et) => et.collectPayment && et.price > 0)
      .reduce((sum, et) => sum + et.price, 0);
    if (total <= 0) {
      return NextResponse.json(
        { success: false, error: 'Esta reserva no requiere pago' },
        { status: 400 },
      );
    }

    // Coupons only apply to one-time payments (not memberships).
    const recurring =
      eventTypes.length === 1 &&
      (eventTypes[0].paymentInterval === 'MONTH' || eventTypes[0].paymentInterval === 'YEAR');
    if (recurring) {
      return NextResponse.json(
        { success: false, error: ERROR_MESSAGES.NOT_APPLICABLE },
        { status: 400 },
      );
    }

    const { coupon, error } = await findRedeemableCoupon(userId, code);
    if (!coupon || error) {
      return NextResponse.json(
        { success: false, error: ERROR_MESSAGES[error || 'NOT_FOUND'] },
        { status: 400 },
      );
    }

    const discountCents = computeCouponDiscount(coupon, total);
    return NextResponse.json({
      success: true,
      data: {
        code: coupon.code,
        valid: true,
        discountCents,
        totalCents: total,
        finalTotalCents: Math.max(0, total - discountCents),
        display: coupon.discountType === 'PERCENTAGE'
          ? `${coupon.discountValue}%`
          : `${(coupon.discountValue / 100).toFixed(2)}€`,
      },
    });
  } catch (error) {
    console.error('Error validating coupon:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
