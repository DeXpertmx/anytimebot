import { prisma } from '@/lib/db';
import type { EmailConflictContactPayload, MergeableCustomer } from '@/lib/crm-merge';

/**
 * One side of a CRM contact conflict, ready for the dialog: the card's fields
 * plus the booking history of the address it currently holds (bookings link to
 * contacts by guest email), so the owner can see which card has the history
 * behind it.
 *
 * `shownEmail` may differ from `historyEmail`: a card being edited shows the
 * address the user just typed while its history still sits on the old one.
 *
 * Shared by every route that reports a conflict (the editor and the manual
 * creation flow) so both dialogs always receive the same shape.
 */
export async function buildConflictContact(
  row: MergeableCustomer,
  shownEmail: string,
  historyEmail: string
): Promise<EmailConflictContactPayload> {
  const where = {
    eventType: { bookingPage: { userId: row.userId } },
    guestEmail: { equals: historyEmail, mode: 'insensitive' as const },
  };
  const [totalBookings, last] = await Promise.all([
    prisma.booking.count({ where }),
    prisma.booking.findFirst({
      where,
      orderBy: { startTime: 'desc' },
      select: { startTime: true },
    }),
  ]);

  return {
    id: row.id,
    email: shownEmail,
    name: row.name,
    company: row.company,
    phone: row.phone,
    photo: row.photo,
    notes: row.notes,
    tags: row.tags,
    marketingOptOut: row.marketingOptOut,
    createdAt: row.createdAt.toISOString(),
    historyEmail,
    totalBookings,
    lastBookingAt: last?.startTime?.toISOString() ?? null,
  };
}
