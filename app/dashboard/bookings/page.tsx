
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { BookingsList } from '@/components/dashboard/bookings/bookings-list';

export const metadata = {
  title: 'Bookings - ANYTIMEBOT',
  description: 'Manage your bookings',
};

export default async function BookingsPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    redirect('/auth/signin');
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    include: {
      bookingPages: {
        include: {
          eventTypes: {
            include: {
              bookings: {
                orderBy: {
                  startTime: 'desc',
                },
              },
            },
          },
        },
      },
    },
  });

  if (!user) {
    redirect('/auth/signin');
  }

  // Flatten all bookings from all event types
  const allBookings = user.bookingPages.flatMap((page) =>
    page.eventTypes.flatMap((eventType) =>
      eventType.bookings.map((booking) => ({
        ...booking,
        eventType: {
          name: eventType.name,
          duration: eventType.duration,
          location: eventType.location,
          videoLink: eventType.videoLink,
        },
        bookingPage: {
          title: page.title,
          slug: page.slug,
        },
      }))
    )
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Bookings</h1>
        <p className="text-gray-600 mt-1">
          Manage and view all your scheduled bookings
        </p>
      </div>
      <BookingsList bookings={allBookings} />
    </div>
  );
}
