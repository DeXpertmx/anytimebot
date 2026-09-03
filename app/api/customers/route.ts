import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

// GET /api/customers - list the owner's CRM contacts with booking stats
// Query params: q (search), tag (filter by tag), tags=1 (return only available tags)
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

    // Tag-only mode: return all distinct tags for quick filter chips
    if (searchParams.get('tags')) {
      const customers = await prisma.customer.findMany({
        where: { userId },
        select: { tags: true },
      });
      const tagCounts = new Map<string, number>();
      for (const customer of customers) {
        for (const item of customer.tags) {
          tagCounts.set(item, (tagCounts.get(item) || 0) + 1);
        }
      }
      const tags = Array.from(tagCounts.entries())
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
      return NextResponse.json({ success: true, data: tags });
    }

    const page = parseInt(searchParams.get('page') || '1');
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);

    const where: any = { userId };
    if (tag) {
      where.tags = { has: tag };
    }
    if (q) {
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
        { company: { contains: q, mode: 'insensitive' } },
        { phone: { contains: q } },
        { tags: { has: q.toLowerCase() } },
      ];
    }
    if (q && tag) {
      where.AND = [{ tags: { has: tag } }, { OR: where.OR }];
      delete where.OR;
      delete where.tags;
    }

    const [customers, total, totalsByMail, confirmedByMail] = await Promise.all([
      prisma.customer.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.customer.count({ where }),
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

    const data = customers.map((customer) => {
      const stats = totalMap.get(customer.email.toLowerCase());
      return {
        ...customer,
        totalBookings: stats?.count || 0,
        confirmedBookings: confirmedMap.get(customer.email.toLowerCase()) || 0,
        lastBookingAt: stats?.last || null,
      };
    });

    return NextResponse.json({
      success: true,
      data,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error('Error fetching customers:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
