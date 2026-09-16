import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import {
  findDuplicateGroups,
  mergeDuplicateCustomers,
  normalizeEmail,
  type MergeableCustomer,
} from '@/lib/crm-merge';

export const dynamic = 'force-dynamic';

/**
 * CRM duplicate contacts.
 *
 * GET  /api/customers/duplicates
 *      Groups of contacts that share an email (case/space variants included),
 *      each with the preview of what merging them keeps. Booking stats are
 *      grouped by the normalized address, because bookings link to the CRM by
 *      guest email.
 *
 * POST /api/customers/duplicates   { email, primaryId? }
 *      Merges that group into one contact. `primaryId` lets the user choose
 *      which record keeps its identity; everything else is folded in and the
 *      extra rows are removed.
 */

/** Booking stats for the whole group: the address is the join key. */
async function groupStats(userId: string, email: string) {
  const [total, confirmed, last] = await Promise.all([
    prisma.booking.count({
      where: {
        eventType: { bookingPage: { userId } },
        guestEmail: { equals: email, mode: 'insensitive' },
      },
    }),
    prisma.booking.count({
      where: {
        eventType: { bookingPage: { userId } },
        status: 'CONFIRMED',
        guestEmail: { equals: email, mode: 'insensitive' },
      },
    }),
    prisma.booking.findFirst({
      where: {
        eventType: { bookingPage: { userId } },
        guestEmail: { equals: email, mode: 'insensitive' },
      },
      orderBy: { startTime: 'desc' },
      select: { startTime: true },
    }),
  ]);
  return { totalBookings: total, confirmedBookings: confirmed, lastBookingAt: last?.startTime ?? null };
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const userId = (session.user as any).id;
    const groups = await findDuplicateGroups(userId);

    const data = await Promise.all(
      groups.map(async (group) => {
        const stats = await groupStats(userId, group.email);
        const contact = (row: MergeableCustomer) => ({
          id: row.id,
          email: row.email,
          name: row.name,
          company: row.company,
          phone: row.phone,
          photo: row.photo,
          notes: row.notes,
          tags: row.tags,
          marketingOptOut: row.marketingOptOut,
          createdAt: row.createdAt,
        });
        return {
          email: group.email,
          contacts: group.contacts.map(contact),
          // Suggested survivor: the one the merge would keep if the user does
          // not pick one explicitly.
          suggestedPrimaryId: group.preview.primaryId,
          preview: group.preview,
          count: group.contacts.length,
          ...stats,
        };
      })
    );

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Error fetching duplicate customers:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const userId = (session.user as any).id;
    const body = await request.json().catch(() => ({}));
    const email = normalizeEmail(typeof body.email === 'string' ? body.email : '');
    if (!email) {
      return NextResponse.json({ success: false, error: 'Invalid email address' }, { status: 400 });
    }

    const primaryId = typeof body.primaryId === 'string' ? body.primaryId : null;
    // A caller-supplied survivor must belong to the group being merged.
    if (primaryId) {
      const groups = await findDuplicateGroups(userId);
      const group = groups.find((item) => item.email === email);
      if (!group || !group.contacts.some((contact) => contact.id === primaryId)) {
        return NextResponse.json(
          { success: false, error: 'Contact not found in this duplicate group' },
          { status: 400 }
        );
      }
    }

    const result = await mergeDuplicateCustomers(userId, email, { prisma }, { primaryId });
    if (result.merged === 0) {
      return NextResponse.json(
        { success: false, error: 'No duplicates to merge' },
        { status: 404 }
      );
    }

    console.info(
      `CRM merge: owner ${userId} merged ${result.merged} duplicate(s) into ${result.primaryId} (${email})`
    );

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error('Error merging duplicate customers:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
