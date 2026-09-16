import { prisma } from '@/lib/db';
import { mergeDuplicateCustomers, normalizeEmail } from '@/lib/crm-merge';

export { normalizeEmail };

/**
 * Upsert a CRM customer record for a booking's guest. Keeps one contact
 * per (owner, email): updates name/phone when the booking provides them.
 *
 * Booking is the moment we learn the contact is still active, so it is also
 * when legacy duplicates of that address (mixed-case / padded emails from
 * imports or older records) are folded back into a single contact — tags and
 * notes unioned, missing company/phone/photo adopted and marketing/detail
 * history preserved under the survivor.
 *
 * Never throws — CRM sync must not break booking creation.
 */
export async function upsertCustomerFromBooking(
  ownerId: string,
  data: { email: string; name?: string | null; phone?: string | null }
) {
  const email = normalizeEmail(data.email);
  if (!email) return null;

  try {
    // Merge first: after this there is at most one row on the normalized
    // address, so the upsert below lands on the surviving contact.
    await mergeDuplicateCustomers(ownerId, email);

    return await prisma.customer.upsert({
      where: { userId_email: { userId: ownerId, email } },
      create: {
        userId: ownerId,
        email,
        name: data.name?.trim() || null,
        phone: data.phone?.trim() || null,
      },
      update: {
        ...(data.name?.trim() ? { name: data.name.trim() } : {}),
        ...(data.phone?.trim() ? { phone: data.phone.trim() } : {}),
      },
    });
  } catch (error) {
    console.error('CRM customer upsert failed:', error);
    return null;
  }
}
