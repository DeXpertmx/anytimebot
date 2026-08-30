import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

// GET /api/customers/export - CSV export of the owner's customers (optional ?q= / ?tag= filters)
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const userId = (session.user as any).id;
    const { searchParams } = new URL(request.url);
    const q = searchParams.get('q')?.trim();
    const tag = searchParams.get('tag')?.trim().toLowerCase();

    const where: any = { userId };
    if (tag) {
      where.tags = { has: tag };
    }
    if (q) {
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
        { phone: { contains: q } },
        { tags: { has: q.toLowerCase() } },
      ];
    }
    if (q && tag) {
      where.AND = [{ tags: { has: tag } }, { OR: where.OR }];
      delete where.OR;
      delete where.tags;
    }

    const [customers, totalsByMail, confirmedByMail] = await Promise.all([
      prisma.customer.findMany({ where, orderBy: { createdAt: 'desc' } }),
      prisma.booking
        .groupBy({
          by: ['guestEmail'],
          where: {
            eventType: { bookingPage: { userId } },
            guestEmail: { not: '' },
          },
          _count: { _all: true },
          _max: { startTime: true },
        })
        .then((rows) =>
          rows.map((row) => ({
            email: (row.guestEmail || '').toLowerCase(),
            count: row._count._all,
            last: row._max.startTime,
          }))
        ),
      prisma.booking
        .groupBy({
          by: ['guestEmail'],
          where: {
            eventType: { bookingPage: { userId } },
            status: 'CONFIRMED',
          },
          _count: { _all: true },
        })
        .then((rows) =>
          rows.map((row) => ({
            email: (row.guestEmail || '').toLowerCase(),
            count: row._count._all,
          }))
        ),
    ]);

    const totalMap = new Map(totalsByMail.map((row) => [row.email, row]));
    const confirmedMap = new Map(confirmedByMail.map((row) => [row.email, row.count]));

    const csvEscape = (value: unknown): string => {
      const str = value == null ? '' : String(value);
      if (/[",\n\r]/.test(str)) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const header = [
      'name',
      'email',
      'phone',
      'tags',
      'notes',
      'total_bookings',
      'confirmed_bookings',
      'last_booking_at',
      'created_at',
    ];
    const rows = customers.map((customer) => {
      const stats = totalMap.get(customer.email.toLowerCase());
      return [
        customer.name || '',
        customer.email,
        customer.phone || '',
        customer.tags.join('; '),
        customer.notes || '',
        stats?.count || 0,
        confirmedMap.get(customer.email.toLowerCase()) || 0,
        stats?.last ? stats.last.toISOString() : '',
        customer.createdAt.toISOString(),
      ]
        .map(csvEscape)
        .join(',');
    });

    // BOM so Excel opens UTF-8 correctly
    const csv = '\uFEFF' + [header.join(','), ...rows].join('\r\n');

    const filenameTag = tag ? `-${tag}` : '';
    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="customers${filenameTag}.csv"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('Error exporting customers:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
