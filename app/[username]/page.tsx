import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { Calendar, Clock, MapPin, Video, Phone, Globe, Linkedin, Twitter, Mail, Star, ArrowRight, BadgeCheck } from 'lucide-react';
import Link from 'next/link';

interface UserPageProps {
  params: {
    username: string;
  };
}

export const dynamic = 'force-dynamic';

export default async function UserPage({ params }: UserPageProps) {
  const { username } = params;

  // Find user by username (case-insensitive) with their active booking pages
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

  const getLocationLabel = (location: string) => {
    switch (location) {
      case 'video': return 'Video call';
      case 'phone': return 'Llamada telefónica';
      case 'in-person': return 'In person';
      default: return 'In person';
    }
  };

  const getLocationIcon = (location: string) => {
    switch (location) {
      case 'video': return <Video className="h-4 w-4" />;
      case 'phone': return <Phone className="h-4 w-4" />;
      case 'in-person': return <MapPin className="h-4 w-4" />;
      default: return <MapPin className="h-4 w-4" />;
    }
  };

  const formatPrice = (price: number, currency: string) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: currency.toUpperCase() }).format(price / 100);

  // Flatten all event types across booking pages for the services grid
  const services = user.bookingPages.flatMap((bp) =>
    bp.eventTypes.map((et) => ({
      et,
      pageSlug: bp.slug,
      pageTitle: bp.title,
    }))
  );

  const hasPriced = services.some((s) => s.et.collectPayment && s.et.price > 0);

  return (
    <div className="min-h-screen bg-white">
      {/* Hero */}
      <div className="relative overflow-hidden bg-gradient-to-br from-indigo-600 via-indigo-700 to-purple-800">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(255,255,255,0.15),transparent_60%)]" />
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
          <div className="flex flex-col md:flex-row items-center md:items-start gap-8">
            {/* Avatar */}
            <div className="flex-shrink-0">
              {user.image ? (
                <img
                  src={user.image}
                  alt={user.name || 'User'}
                  className="w-28 h-28 md:w-36 md:h-36 rounded-3xl object-cover border-4 border-white/30 shadow-2xl"
                />
              ) : (
                <div className="w-28 h-28 md:w-36 md:h-36 rounded-3xl bg-white/15 backdrop-blur flex items-center justify-center border-4 border-white/30 shadow-2xl">
                  <span className="text-white font-bold text-5xl">
                    {user.name?.[0] || user.email[0].toUpperCase()}
                  </span>
                </div>
              )}
            </div>

            {/* Identity */}
            <div className="flex-1 text-center md:text-left">
              <div className="flex items-center justify-center md:justify-start gap-2 mb-1">
                <h1 className="text-3xl md:text-5xl font-extrabold text-white tracking-tight">
                  {user.name || user.email}
                </h1>
                <BadgeCheck className="h-6 w-6 text-cyan-300" />
              </div>
              <p className="text-lg text-indigo-200 mb-4">@{user.username}</p>

              {user.bio && (
                <p className="text-indigo-100 text-lg leading-relaxed max-w-2xl mb-4">
                  {user.bio}
                </p>
              )}

              {user.company && (
                <p className="text-indigo-200 flex items-center justify-center md:justify-start gap-2 mb-2">
                  <Globe className="h-4 w-4" />
                  {user.company}
                </p>
              )}

              {/* Socials */}
              <div className="flex items-center justify-center md:justify-start gap-4 mt-4">
                {user.website && (
                  <a href={user.website} target="_blank" rel="noopener noreferrer" aria-label="Sitio web" className="text-white/70 hover:text-white transition-colors">
                    <Globe className="h-5 w-5" />
                  </a>
                )}
                {user.linkedin && (
                  <a href={user.linkedin} target="_blank" rel="noopener noreferrer" aria-label="LinkedIn" className="text-white/70 hover:text-white transition-colors">
                    <Linkedin className="h-5 w-5" />
                  </a>
                )}
                {user.twitter && (
                  <a href={user.twitter} target="_blank" rel="noopener noreferrer" aria-label="Twitter" className="text-white/70 hover:text-white transition-colors">
                    <Twitter className="h-5 w-5" />
                  </a>
                )}
                {user.phone && (
                  <a href={`tel:${user.phone}`} aria-label="Teléfono" className="text-white/70 hover:text-white transition-colors">
                    <Phone className="h-5 w-5" />
                  </a>
                )}
                <a href={`mailto:${user.email}`} aria-label="Correo electrónico" className="text-white/70 hover:text-white transition-colors">
                  <Mail className="h-5 w-5" />
                </a>
              </div>

              {/* Primary CTA */}
              {user.bookingPages[0] && (
                <div className="mt-8">
                  <Link
                    href={`/${username}/${user.bookingPages[0].slug}`}
                    className="inline-flex items-center gap-2 bg-white text-indigo-700 font-semibold px-6 py-3 rounded-full shadow-lg hover:bg-indigo-50 transition-all hover:scale-105"
                  >
                    <Calendar className="h-5 w-5" />
                    Reservar ahora
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Servicios */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="flex items-end justify-between mb-10">
          <div>
            <h2 className="text-3xl font-bold text-gray-900">Servicios</h2>
            <p className="text-gray-500 mt-1">
              {services.length} {services.length === 1 ? 'service' : 'services'} available
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {services.map(({ et, pageSlug }) => (
            <Link
              key={et.id}
              href={`/${username}/${pageSlug}?event=${et.id}`}
              className="group"
            >
              <div className="h-full rounded-2xl border border-gray-200 bg-white p-6 shadow-sm hover:shadow-xl hover:border-indigo-200 hover:-translate-y-1 transition-all duration-300 flex flex-col">
                <div className="w-10 h-10 rounded-xl mb-4 flex items-center justify-center"
                  style={{ backgroundColor: `${et.color}1a` }}>
                  <div className="w-4 h-4 rounded-full" style={{ backgroundColor: et.color }} />
                </div>

                <h3 className="text-lg font-semibold text-gray-900 group-hover:text-indigo-600 transition-colors">
                  {et.name}
                </h3>

                <div className="mt-3 space-y-2 flex-1">
                  <div className="flex items-center text-sm text-gray-600">
                    <Clock className="h-4 w-4 mr-2 text-indigo-500" />
                    {et.duration} min
                  </div>
                  <div className="flex items-center text-sm text-gray-600">
                    {getLocationIcon(et.location)}
                    <span className="ml-2">{getLocationLabel(et.location)}</span>
                  </div>
                </div>

                <div className="mt-5 pt-4 border-t border-gray-100 flex items-center justify-between">
                  {et.collectPayment && et.price > 0 ? (
                    <div className="flex flex-col">
                      <span className="text-lg font-bold text-gray-900">
                        {formatPrice(et.price, et.currency)}
                        {et.paymentInterval === 'MONTH'
                          ? '/mes'
                          : et.paymentInterval === 'YEAR'
                            ? '/año'
                            : ''}
                      </span>
                      {et.paymentInterval === 'YEAR' && (() => {
                        const monthly = services.find(
                          (s) =>
                            s.et.id !== et.id &&
                            s.et.collectPayment &&
                            s.et.price > 0 &&
                            (s.et.paymentInterval === 'MONTH' || !s.et.paymentInterval) &&
                            s.et.name.trim().toLowerCase() === et.name.trim().toLowerCase()
                        )?.et;
                        const monthlyCost = monthly?.price ?? Math.round(et.price / 12);
                        const savings = monthlyCost * 12 - et.price;
                        if (savings > 0) {
                          return (
                            <span className="text-xs font-medium text-emerald-600">
                              Ahorra un {Math.round((savings / (et.price + savings)) * 100)}%
                            </span>
                          );
                        }
                        return null;
                      })()}
                    </div>
                  ) : (
                    <span className="text-sm font-medium text-emerald-600">Gratis</span>
                  )}
                  <span className="inline-flex items-center gap-1 text-sm font-medium text-indigo-600 group-hover:gap-2 transition-all">
                    Book
                    <ArrowRight className="h-4 w-4" />
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-gray-50 border-t">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 bg-indigo-600 rounded-lg flex items-center justify-center">
                <Calendar className="h-4 w-4 text-white" />
              </div>
              <span className="text-gray-900 font-semibold">ANYTIMEBOT</span>
            </div>
            <p className="text-gray-500 text-sm">
              © 2026 ANYTIMEBOT · Powered by anytimebot.app
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
