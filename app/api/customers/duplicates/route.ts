import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import {
  findDuplicateGroups,
  findPhoneDuplicateGroups,
  mergeDuplicateCustomers,
  mergePhoneDuplicates,
  normalizeEmail,
  normalizePhone,
  type MergeableCustomer,
} from '@/lib/crm-merge';

export const dynamic = 'force-dynamic';

/**
 * CRM duplicate contacts.
 *
 * GET  /api/customers/duplicates
 *      Groups of contacts that share an email (case/space variants included),
 *      each with the preview of what merging them keeps, plus `phoneGroups`: a
 *      separate list of contacts sharing a phone number. Phone groups are
 *      advisory (same number may be two people), so they come with a flag and
 *      are only merged when the owner confirms it. Booking stats are grouped by
 *      the normalized address, because bookings link to the CRM by guest email.
 *
 * POST /api/customers/duplicates   { email, primaryId?, kind? }
 *      Merges that group into one contact. `primaryId` lets the user choose
 *      which record keeps its identity; everything else is folded in and the
 *      extra rows are removed. `kind: 'phone'` merges a phone group instead:
 *      `email` carries the normalized number and the survivor keeps its own
 *      address (the other cards' emails are not re-pointed to it).
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

/** Contact shape sent to the dialog for every card of a group. */
function contactPayload(row: MergeableCustomer) {
  return {
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
  };
}

/**
 * Bookings shared by the cards of a phone group: the bookings of every card's
 * address, counted on the union (a guest may have booked under either email).
 */
async function phoneGroupStats(userId: string, contacts: MergeableCustomer[]) {
  const emails = [...new Set(contacts.map((row) => normalizeEmail(row.email)).filter(Boolean))];
  if (emails.length === 0) return { totalBookings: 0, lastBookingAt: null as Date | null };
  const where = {
    eventType: { bookingPage: { userId } },
    guestEmail: { in: emails, mode: 'insensitive' as const },
  };
  const [total, last] = await Promise.all([
    prisma.booking.count({ where }),
    prisma.booking.findFirst({ where, orderBy: { startTime: 'desc' }, select: { startTime: true } }),
  ]);
  return { totalBookings: total, lastBookingAt: last?.startTime ?? null };
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const userId = (session.user as any).id;
    const [groups, phoneGroups] = await Promise.all([
      findDuplicateGroups(userId),
      findPhoneDuplicateGroups(userId),
    ]);

    const data = await Promise.all(
      groups.map(async (group) => {
        const stats = await groupStats(userId, group.email);
        return {
          email: group.email,
          contacts: group.contacts.map(contactPayload),
          // Suggested survivor: the one the merge would keep if the user does
          // not pick one explicitly.
          suggestedPrimaryId: group.preview.primaryId,
          preview: group.preview,
          count: group.contacts.length,
          ...stats,
        };
      })
    );

    const phones = await Promise.all(
      phoneGroups.map(async (group) => {
        const stats = await phoneGroupStats(userId, group.contacts);
        return {
          // The phone group's key is the normalized number (digits only).
          email: group.email,
          contacts: group.contacts.map(contactPayload),
          suggestedPrimaryId: group.preview.primaryId,
          preview: group.preview,
          count: group.contacts.length,
          ...stats,
        };
      })
    );

    return NextResponse.json({ success: true, data, phoneGroups: phones });
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
    const kind = body.kind === 'phone' ? 'phone' : 'email';

    // Phone groups key on the normalized number; email groups on the address.
    const key =
      kind === 'phone'
        ? normalizePhone(typeof body.email === 'string' ? body.email : '')
        : normalizeEmail(typeof body.email === 'string' ? body.email : '');
    if (!key) {
      return NextResponse.json(
        { success: false, error: kind === 'phone' ? 'Invalid phone number' : 'Invalid email address' },
        { status: 400 }
      );
    }

    const primaryId = typeof body.primaryId === 'string' ? body.primaryId : null;
    // A caller-supplied survivor must belong to the group being merged.
    if (primaryId) {
      const group = kind === 'phone'
        ? (await findPhoneDuplicateGroups(userId)).find((item) => item.email === key)
        : (await findDuplicateGroups(userId)).find((item) => item.email === key);
      if (!group || !group.contacts.some((contact) => contact.id === primaryId)) {
        return NextResponse.json(
          { success: false, error: 'Contact not found in this duplicate group' },
          { status: 400 }
        );
      }
    }

    const result =
      kind === 'phone'
        ? await mergePhoneDuplicates(userId, key, { prisma }, { primaryId })
        : await mergeDuplicateCustomers(userId, key, { prisma }, { primaryId });
    if (result.merged === 0) {
      return NextResponse.json(
        { success: false, error: 'No duplicates to merge' },
        { status: 404 }
      );
    }

    console.info(
      `CRM merge (${kind}): owner ${userId} merged ${result.merged} duplicate(s) into ${result.primaryId} (${key})`
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
