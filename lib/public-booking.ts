import { prisma } from '@/lib/db';

/**
 * Fetch a user and their active booking page (with event types and
 * availability) by public username + slug. Shared by the public booking
 * page and the embeddable widget page.
 */
export async function getBookingPageData(username: string, slug: string) {
  return prisma.user.findFirst({
    where: {
      username: {
        equals: username,
        mode: 'insensitive',
      },
    },
    include: {
      bookingPages: {
        where: {
          slug,
          isActive: true,
        },
        include: {
          eventTypes: {
            include: {
              formFields: true,
            },
          },
          availability: {
            where: { isAvailable: true },
            orderBy: { dayOfWeek: 'asc' },
          },
        },
      },
    },
  });
}
