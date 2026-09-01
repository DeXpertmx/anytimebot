import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

function parseDate(value: string | null, endOfDay = false): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  if (endOfDay && value.length <= 10) {
    // Date-only "to" filter should include the whole day
    date.setHours(23, 59, 59, 999);
  }
  return date;
}

// GET /api/revenue?from=YYYY-MM-DD&to=YYYY-MM-DD
// Advanced revenue reports for the authenticated owner. Aggregates paid
// bookings (paymentStatus PAID, refunds tracked separately) plus recurring
// membership renewals over the last 12 months (or the given date range):
// totals, monthly series and per-event-type breakdown.
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const userId = (session.user as any).id as string;

    // Use the currency configured for operating (falls back to EUR default).
    const configuredUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { currency: true },
    });
    const displayCurrency = configuredUser?.currency?.toUpperCase?.() || 'EUR';

    const { searchParams } = new URL(request.url);
    const from = parseDate(searchParams.get('from'));
    const to = parseDate(searchParams.get('to'), true);

    const paidWhere: any = {
      paymentStatus: 'PAID',
      eventType: { bookingPage: { userId } },
    };
    const refundedWhere: any = {
      paymentStatus: 'REFUNDED',
      eventType: { bookingPage: { userId } },
    };

    const applyRange = (target: any) => {
      const paidAtFilter: any = {};
      if (from) paidAtFilter.gte = from;
      if (to) paidAtFilter.lte = to;
      if (Object.keys(paidAtFilter).length > 0) {
        target.OR = [
          { paidAt: paidAtFilter },
          { paidAt: null, createdAt: paidAtFilter },
        ];
      }
    };
    applyRange(paidWhere);
    applyRange(refundedWhere);

    const paidBookings = await prisma.booking.findMany({
      where: paidWhere,
      select: {
        id: true,
        paymentAmount: true,
        paymentCurrency: true,
        paidAt: true,
        createdAt: true,
        status: true,
        eventType: { select: { id: true, name: true, color: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Refunded bookings tracked separately for net calculation
    const refunded = await prisma.booking.findMany({
      where: refundedWhere,
      select: { paymentAmount: true, paymentCurrency: true },
    });

    // Recurring membership renewals: each successful invoice is a subscription
    // payment on one of the tenant's membership subscriptions.
    const recurringPayments = await prisma.subscriptionPayment.findMany({
      where: {
        subscription: { userId },
        paidAt: {
          ...(from ? { gte: from } : {}),
          ...(to ? { lte: to } : {}),
        },
      },
      select: { id: true, amount: true, currency: true, paidAt: true },
    });

    const grossCents = paidBookings.reduce((sum, b) => sum + (b.paymentAmount || 0), 0);
    const refundedCents = refunded.reduce((sum, b) => sum + (b.paymentAmount || 0), 0);
    const recurringCents = recurringPayments.reduce((sum, p) => sum + (p.amount || 0), 0);

    // Monthly series (based on paidAt, fallback createdAt). When a custom
    // range is given, buckets are still calendar months within the window.
    const now = new Date();
    const anchorFrom = from || new Date(now.getFullYear(), now.getMonth() - 11, 1);
    const anchorTo = to || new Date();
    const months: Array<{ key: string; label: string; revenue: number; bookings: number }> = [];
    const cursor = new Date(anchorFrom.getFullYear(), anchorFrom.getMonth(), 1);
    while (cursor <= anchorTo) {
      months.push({
        key: `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`,
        label: cursor.toLocaleDateString('es', { month: 'short' }),
        revenue: 0,
        bookings: 0,
      });
      cursor.setMonth(cursor.getMonth() + 1);
    }
    const monthIndex = new Map(months.map((m, i) => [m.key, i]));

    // Per-event-type breakdown
    const byType = new Map<string, { id: string; name: string; color: string; revenue: number; bookings: number }>();

    for (const b of paidBookings) {
      const when = b.paidAt || b.createdAt;
      const key = `${when.getFullYear()}-${String(when.getMonth() + 1).padStart(2, '0')}`;
      const idx = monthIndex.get(key);
      if (idx !== undefined) {
        months[idx].revenue += (b.paymentAmount || 0) / 100;
        months[idx].bookings += 1;
      }

      const et = b.eventType;
      if (et) {
        const entry = byType.get(et.id) || {
          id: et.id,
          name: et.name,
          color: et.color,
          revenue: 0,
          bookings: 0,
        };
        entry.revenue += (b.paymentAmount || 0) / 100;
        entry.bookings += 1;
        byType.set(et.id, entry);
      }
    }

    // Add recurring renewals to the monthly series too.
    for (const p of recurringPayments) {
      const when = p.paidAt || new Date();
      const key = `${when.getFullYear()}-${String(when.getMonth() + 1).padStart(2, '0')}`;
      const idx = monthIndex.get(key);
      if (idx !== undefined) {
        months[idx].revenue += (p.amount || 0) / 100;
      }
    }

    const currency = displayCurrency;
    const avgBooking = paidBookings.length > 0 ? grossCents / paidBookings.length / 100 : 0;

    return NextResponse.json({
      success: true,
      data: {
        currency,
        grossTotal: (grossCents + recurringCents) / 100,
        refundedTotal: refundedCents / 100,
        netTotal: (grossCents + recurringCents - refundedCents) / 100,
        paidBookings: paidBookings.length + recurringPayments.length,
        avgBooking,
        months,
        byType: [...byType.values()].sort((a, b) => b.revenue - a.revenue),
      },
    });
  } catch (error) {
    console.error('Error building revenue report:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}