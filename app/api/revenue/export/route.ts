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

// GET /api/revenue/export?from=YYYY-MM-DD&to=YYYY-MM-DD
// CSV export of the owner's paid bookings (optional date-range filters).
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const userId = (session.user as any).id;
    const { searchParams } = new URL(request.url);
    const from = parseDate(searchParams.get('from'));
    const to = parseDate(searchParams.get('to'), true);

    const where: any = {
      paymentStatus: { in: ['PAID', 'REFUNDED'] },
      eventType: { bookingPage: { userId } },
    };
    const paidAtFilter: any = {};
    if (from) paidAtFilter.gte = from;
    if (to) paidAtFilter.lte = to;
    if (Object.keys(paidAtFilter).length > 0) {
      where.OR = [
        { paidAt: paidAtFilter },
        { paidAt: null, createdAt: paidAtFilter },
      ];
    }

    const bookings = await prisma.booking.findMany({
      where,
      select: {
        id: true,
        guestName: true,
        guestEmail: true,
        startTime: true,
        paymentStatus: true,
        paymentAmount: true,
        paymentCurrency: true,
        paidAt: true,
        createdAt: true,
        eventType: { select: { name: true } },
      },
      orderBy: [{ paidAt: 'desc' }, { createdAt: 'desc' }],
      take: 10000,
    });

    const escape = (value: string | number | null | undefined): string => {
      const s = value === null || value === undefined ? '' : String(value);
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };

    const rows: string[] = [
      [
        'booking_id',
        'event_type',
        'guest_name',
        'guest_email',
        'start_time',
        'paid_at',
        'status',
        'amount',
        'currency',
      ].join(','),
    ];

    for (const b of bookings) {
      rows.push(
        [
          b.id,
          b.eventType?.name ?? '',
          b.guestName,
          b.guestEmail,
          b.startTime ? new Date(b.startTime).toISOString() : '',
          b.paidAt ? new Date(b.paidAt).toISOString() : '',
          b.paymentStatus ?? '',
          ((b.paymentAmount ?? 0) / 100).toFixed(2),
          (b.paymentCurrency || 'usd').toUpperCase(),
        ]
          .map(escape)
          .join(','),
      );
    }

    const csv = rows.join('\r\n');
    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="revenue-export-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  } catch (error) {
    console.error('Error exporting revenue:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
