import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { Calendar, Clock, MapPin, Video, Phone, ExternalLink, Globe, Linkedin, Twitter, Mail, DollarSign, ArrowRight } from 'lucide-react';
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

  const formatPrice = (price: number, currency: string) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency.toUpperCase(),
    }).format(price / 100);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50">
      {/* Hero Section */}
      <div className="relative overflow-hidden bg-gradient-to-r from-indigo-600 via-indigo-700 to-purple-700">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wNSI+PHBhdGggZD0iTTM2IDM0djItSDI0di0yaDEyem0wLTRWMjhIMjR2Mmgxem0tMjItNHYySDI0di0yaDF6bTIwIDB2Mkg0NHYtMmgxem0wLTRWMjhINHYyaDEyem0wLTRWMjRINHYyaDEyeiIvPjwvZz48L2c+PC9zdmc+')] opacity-30" />
        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <div className="flex flex-col md:flex-row items-center md:items-start gap-8">
            {/* Avatar */}
            <div className="flex-shrink-0">
              {user.image ? (
                <img
                  src={user.image}
                  alt={user.name || 'User'}
                  className="w-32 h-32 rounded-2xl object-cover border-4 border-white/30 shadow-xl"
                />
              ) : (
                <div className="w-32 h-32 rounded-2xl bg-white/20 flex items-center justify-center border-4 border-white/30 shadow-xl">
                  <span className="text-white font-bold text-4xl">
                    {user.name?.[0] || user.email[0].toUpperCase()}
                  </span>
                </div>
              )}
            </div>

            {/* User Info */}
            <div className="flex-1 text-center md:text-left">
              <h1 className="text-4xl font-bold text-white mb-2">
                {user.name || user.email}
              </h1>
              <p className="text-xl text-indigo-200 mb-4">@{user.username}</p>
              
              {user.company && (
                <p className="text-lg text-indigo-100 mb-2 flex items-center justify-center md:justify-start gap-2">
                  <Globe className="h-5 w-5" />
                  {user.company}
                </p>
              )}

              {user.bio && (
                <p className="text-indigo-100 text-lg leading-relaxed max-w-2xl">
                  {user.bio}
                </p>
              )}

              {/* Social Links */}
              <div className="flex items-center justify-center md:justify-start gap-4 mt-6">
                {user.website && (
                  <a href={user.website} target="_blank" rel="noopener noreferrer" className="text-white/80 hover:text-white transition-colors">
                    <Globe className="h-5 w-5" />
                  </a>
                )}
                {user.linkedin && (
                  <a href={user.linkedin} target="_blank" rel="noopener noreferrer" className="text-white/80 hover:text-white transition-colors">
                    <Linkedin className="h-5 w-5" />
                  </a>
                )}
                {user.twitter && (
                  <a href={user.twitter} target="_blank" rel="noopener noreferrer" className="text-white/80 hover:text-white transition-colors">
                    <Twitter className="h-5 w-5" />
                  </a>
                )}
                {user.phone && (
                  <a href={`tel:${user.phone}`} className="text-white/80 hover:text-white transition-colors">
                    <Phone className="h-5 w-5" />
                  </a>
                )}
                <a href={`mailto:${user.email}`} className="text-white/80 hover:text-white transition-colors">
                  <Mail className="h-5 w-5" />
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Booking Pages */}
        {user.bookingPages.map((bookingPage) => (
          <div key={bookingPage.id} className="mb-16">
            <div className="mb-8">
              <h2 className="text-3xl font-bold text-gray-900 mb-3">
                {bookingPage.title}
              </h2>
              {bookingPage.description && (
                <p className="text-lg text-gray-600 max-w-2xl">
                  {bookingPage.description}
                </p>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {bookingPage.eventTypes.map((eventType) => (
                <Link
                  key={eventType.id}
                  href={`/${username}/${bookingPage.slug}`}
                >
                  <Card className="p-6 hover:shadow-xl transition-all duration-300 cursor-pointer border-l-4 h-full group hover:-translate-y-1"
                    style={{ borderLeftColor: eventType.color }}
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1">
                        <h3 className="text-xl font-semibold text-gray-900 group-hover:text-indigo-600 transition-colors">
                          {eventType.name}
                        </h3>
                      </div>
                      <ArrowRight className="h-5 w-5 text-gray-400 group-hover:text-indigo-600 transition-colors" />
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center text-sm text-gray-600">
                        <Clock className="h-4 w-4 mr-2 text-indigo-500" />
                        <span>{eventType.duration} minutos</span>
                      </div>
                      <div className="flex items-center text-sm text-gray-600">
                        {getLocationIcon(eventType.location)}
                        <span className="ml-2 capitalize">
                          {eventType.location === 'video' ? 'Videollamada' : eventType.location === 'phone' ? 'Llamada telefónica' : 'En persona'}
                        </span>
                      </div>
                      {eventType.collectPayment && eventType.price > 0 && (
                        <div className="flex items-center text-sm font-semibold text-emerald-600">
                          <DollarSign className="h-4 w-4 mr-1" />
                          <span>{formatPrice(eventType.price, eventType.currency)}</span>
                        </div>
                      )}
                    </div>

                    {eventType.requiresConfirmation && (
                      <div className="mt-4 text-xs text-amber-600 bg-amber-50 px-3 py-1.5 rounded-full inline-block">
                        Requiere confirmación
                      </div>
                    )}
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        ))}
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
              © 2026 ANYTIMEBOT. Smart scheduling made simple.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}