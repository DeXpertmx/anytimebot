import { prisma } from '@/lib/db';

/**
 * Upsert a CRM customer record for a booking's guest. Keeps one contact
 * per (owner, email): updates name/phone when the booking provides them.
 * Never throws — CRM sync must not break booking creation.
 */
export async function upsertCustomerFromBooking(
  ownerId: string,
  data: { email: string; name?: string | null; phone?: string | null }
) {
  const email = data.email?.trim().toLowerCase();
  if (!email) return null;

  try {
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
