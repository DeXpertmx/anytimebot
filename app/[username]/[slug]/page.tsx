
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { BookingForm } from '@/components/public/booking-form';
import { Calendar, Clock, MapPin, Video, Phone, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import type { EventType, BookingFormField } from '@prisma/client';

interface BookingPageProps {
  params: {
    username: string;
    slug: string;
  };
}

export default async function PublicBookingPage({ params }: BookingPageProps) {
  const { username, slug } = params;

  // Find the user by username (case-insensitive)
  const user = await prisma.user.findFirst({
    where: { 
      username: {
        equals: username,
        mode: 'insensitive',
      }
    },
    include: {
      bookingPages: {
        where: { slug },
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

  if (!user || !user.bookingPages[0]) {
    notFound();
  }

  const bookingPage = user.bookingPages[0];

  if (!bookingPage.isActive) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-cyan-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center">
          <div className="bg-white rounded-lg shadow-lg p-8">
            <Calendar className="mx-auto h-12 w-12 text-gray-400 mb-4" />
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              Page Not Available
            </h1>
            <p className="text-gray-600">
              This booking page is currently inactive.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const getLocationIcon = (location: string) => {
    switch (location) {
      case 'video':
        return <Video className="h-5 w-5" />;
      case 'phone':
        return <Phone className="h-5 w-5" />;
      case 'in-person':
        return <MapPin className="h-5 w-5" />;
      default:
        return <MapPin className="h-5 w-5" />;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-cyan-50">
      {/* Header */}
      <header className="border-b bg-white/80 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div className="flex items-center">
              <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center mr-3">
                <Calendar className="h-5 w-5 text-white" />
              </div>
              <span className="text-2xl font-bold text-gray-900">ANYTIMEBOT</span>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <Link
          href={`/${username}`}
          className="inline-flex items-center text-sm text-indigo-600 hover:text-indigo-700 mb-6"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to all events
        </Link>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column - Event Type Info */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow-lg p-6 sticky top-6">
              <div className="flex items-center mb-4">
                {user.image ? (
                  <img
                    src={user.image}
                    alt={user.name || 'User'}
                    className="w-12 h-12 rounded-full mr-3"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-indigo-100 flex items-center justify-center mr-3">
                    <span className="text-indigo-600 font-semibold text-lg">
                      {user.name?.[0] || user.email[0].toUpperCase()}
                    </span>
                  </div>
                )}
                <div>
                  <h2 className="font-semibold text-gray-900">
                    {user.name || user.email}
                  </h2>
                  <p className="text-sm text-gray-600">@{user.username}</p>
                </div>
              </div>

              <div className="border-t pt-4 mt-4">
                <h3 className="text-xl font-bold text-gray-900 mb-2">
                  {bookingPage.title}
                </h3>
                {bookingPage.description && (
                  <p className="text-sm text-gray-600 mb-4">
                    {bookingPage.description}
                  </p>
                )}
              </div>

              <div className="border-t pt-4 mt-4 space-y-4">
                <h4 className="font-semibold text-gray-900 mb-3">
                  Available Event Types
                </h4>
                {bookingPage.eventTypes.map((eventType: EventType & { formFields: BookingFormField[] }) => (
                  <div
                    key={eventType.id}
                    className="p-3 border-l-4 bg-gray-50 rounded"
                    style={{ borderLeftColor: eventType.color }}
                  >
                    <h5 className="font-medium text-gray-900">
                      {eventType.name}
                    </h5>
                    <div className="flex items-center text-sm text-gray-600 mt-1">
                      <Clock className="h-4 w-4 mr-1" />
                      <span>{eventType.duration} minutes</span>
                    </div>
                    <div className="flex items-center text-sm text-gray-600 mt-1">
                      {getLocationIcon(eventType.location)}
                      <span className="ml-1 capitalize">
                        {eventType.location}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right Column - Booking Form */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-lg shadow-lg p-6">
              <h3 className="text-2xl font-bold text-gray-900 mb-6">
                Schedule Your Meeting
              </h3>
              <BookingForm
                bookingPage={bookingPage}
                eventTypes={bookingPage.eventTypes}
                availability={bookingPage.availability}
                timezone={user.timezone}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-white border-t mt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex items-center justify-center">
            <div className="flex items-center">
              <div className="w-6 h-6 bg-indigo-600 rounded-lg flex items-center justify-center mr-2">
                <Calendar className="h-4 w-4 text-white" />
              </div>
              <span className="text-gray-900 font-semibold">ANYTIMEBOT</span>
            </div>
            <p className="text-gray-500 ml-4">
              © 2024 ANYTIMEBOT. Smart scheduling made simple.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
