import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

// GET /api/revenue — advanced revenue reports for the authenticated owner.
// Aggregates paid bookings (paymentStatus PAID, excluding REFUNDED) over the
// last 12 months: totals, monthly series and per-event-type breakdown.
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const userId = (session.user as any).id as string;

    const paidBookings = await prisma.booking.findMany({
      where: {
        paymentStatus: 'PAID',
        eventType: {
          bookingPage: { userId },
        },
      },
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
      where: {
        paymentStatus: 'REFUNDED',
        eventType: { bookingPage: { userId } },
      },
      select: { paymentAmount: true, paymentCurrency: true },
    });

    const grossCents = paidBookings.reduce((sum, b) => sum + (b.paymentAmount || 0), 0);
    const refundedCents = refunded.reduce((sum, b) => sum + (b.paymentAmount || 0), 0);

    // Monthly series for the last 12 months (based on paidAt, fallback createdAt)
    const now = new Date();
    const months: Array<{ key: string; label: string; revenue: number; bookings: number }> = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({
        key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
        label: d.toLocaleDateString('es', { month: 'short' }),
        revenue: 0,
        bookings: 0,
      });
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

    const currency = paidBookings[0]?.paymentCurrency?.toUpperCase() || 'USD';
    const avgBooking = paidBookings.length > 0 ? grossCents / paidBookings.length / 100 : 0;

    return NextResponse.json({
      success: true,
      data: {
        currency,
        grossTotal: grossCents / 100,
        refundedTotal: refundedCents / 100,
        netTotal: (grossCents - refundedCents) / 100,
        paidBookings: paidBookings.length,
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
