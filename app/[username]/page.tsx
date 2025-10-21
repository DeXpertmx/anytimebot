
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { Calendar, Clock, MapPin, Video, Phone, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';

interface UserPageProps {
  params: {
    username: string;
  };
}

export default async function UserPage({ params }: UserPageProps) {
  const { username } = params;

  // Find user by username (case-insensitive)
  const user = await prisma.user.findFirst({
    where: { 
      username: {
        equals: username,
        mode: 'insensitive',
      }
    },
    include: {
      bookingPages: {
        where: { isActive: true },
        include: {
          eventTypes: true,
        },
      },
    },
  });

  if (!user || user.bookingPages.length === 0) {
    notFound();
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

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* User Profile */}
        <div className="text-center mb-12">
          {user.image ? (
            <img
              src={user.image}
              alt={user.name || 'User'}
              className="w-24 h-24 rounded-full mx-auto mb-4 border-4 border-white shadow-lg"
            />
          ) : (
            <div className="w-24 h-24 rounded-full mx-auto mb-4 bg-indigo-100 flex items-center justify-center border-4 border-white shadow-lg">
              <span className="text-indigo-600 font-bold text-3xl">
                {user.name?.[0] || user.email[0].toUpperCase()}
              </span>
            </div>
          )}
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            {user.name || user.email}
          </h1>
          <p className="text-gray-600">@{user.username}</p>
        </div>

        {/* Booking Pages */}
        <div className="space-y-8">
          {user.bookingPages.map((bookingPage) => (
            <div key={bookingPage.id}>
              <div className="mb-4">
                <h2 className="text-2xl font-bold text-gray-900">
                  {bookingPage.title}
                </h2>
                {bookingPage.description && (
                  <p className="text-gray-600 mt-2">
                    {bookingPage.description}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {bookingPage.eventTypes.map((eventType) => (
                  <Link
                    key={eventType.id}
                    href={`/${username}/${bookingPage.slug}`}
                  >
                    <Card className="p-6 hover:shadow-lg transition-shadow cursor-pointer border-l-4 h-full"
                      style={{ borderLeftColor: eventType.color }}
                    >
                      <div className="flex items-start justify-between mb-3">
                        <h3 className="text-lg font-semibold text-gray-900">
                          {eventType.name}
                        </h3>
                        <ExternalLink className="h-5 w-5 text-gray-400" />
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center text-sm text-gray-600">
                          <Clock className="h-4 w-4 mr-2" />
                          <span>{eventType.duration} minutes</span>
                        </div>
                        <div className="flex items-center text-sm text-gray-600">
                          {getLocationIcon(eventType.location)}
                          <span className="ml-2 capitalize">
                            {eventType.location}
                          </span>
                        </div>
                      </div>

                      {eventType.requiresConfirmation && (
                        <div className="mt-3 text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded inline-block">
                          Requires Confirmation
                        </div>
                      )}
                    </Card>
                  </Link>
                ))}
              </div>
            </div>
          ))}
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
