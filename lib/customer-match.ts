import { prisma } from '@/lib/db';

/**
 * A slim view of a CRM Customer attached to a booking so the UI can show
 * the contact's photo without an extra round-trip per booking.
 */
export type BookingCustomerView = {
  id: string;
  name: string | null;
  email: string;
  photo: string | null;
  company: string | null;
  phone: string | null;
};

/**
 * Fetch the CRM customers whose email matches any of the given guest emails
 * (case-insensitive; customer emails are stored lowercased).
 * Returns a Map keyed by the lowercase email.
 */
export async function findCustomersByGuestEmails(
  userId: string,
  guestEmails: (string | null | undefined)[]
): Promise<Map<string, BookingCustomerView>> {
  const emails = Array.from(
    new Set(
      guestEmails
        .map((e) => e?.trim().toLowerCase())
        .filter((e): e is string => Boolean(e))
    )
  );
  if (emails.length === 0) return new Map();

  const customers = await prisma.customer.findMany({
    where: {
      userId,
      email: { in: emails },
    },
    select: {
      id: true,
      name: true,
      email: true,
      photo: true,
      company: true,
      phone: true,
    },
  });

  const byEmail = new Map<string, BookingCustomerView>();
  for (const c of customers) {
    byEmail.set(c.email.toLowerCase(), {
      id: c.id,
      name: c.name,
      email: c.email,
      photo: c.photo,
      company: c.company,
      phone: c.phone,
    });
  }
  return byEmail;
}

/**
 * Attach the matching CRM customer to each booking as a plain `customer`
 * field (or null when the email does not match any contact).
 */
export function attachCustomerToBooking<
  T extends { guestEmail?: string | null },
>(
  booking: T,
  byEmail: Map<string, BookingCustomerView>
): T & { customer: BookingCustomerView | null } {
  const email = booking.guestEmail?.trim().toLowerCase();
  return {
    ...booking,
    customer: email ? byEmail.get(email) ?? null : null,
  } as T & { customer: BookingCustomerView | null };
}

export function attachCustomersToBookings<
  T extends { guestEmail?: string | null },
>(bookings: T[], byEmail: Map<string, BookingCustomerView>) {
  return bookings.map((booking) => attachCustomerToBooking(booking, byEmail));
}
