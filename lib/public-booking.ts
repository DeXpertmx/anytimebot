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
              // Default sede: lets the public pages show the physical venue
              // (name + address) of in-person events on their cards.
              defaultLocation: {
                select: {
                  id: true,
                  name: true,
                  address: true,
                  city: true,
                  country: true,
                  timezone: true,
                },
              },
              // Branches where the event is offered (multi-sede picker).
              locations: {
                include: {
                  location: {
                    select: {
                      id: true,
                      name: true,
                      address: true,
                      city: true,
                      country: true,
                      timezone: true,
                    },
                  },
                },
              },
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
