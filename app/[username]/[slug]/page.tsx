
import { notFound } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getBookingPageData } from '@/lib/public-booking';
import { BookingForm } from '@/components/public/booking-form';
import { OwnerShareBar } from '@/components/public/owner-share-bar';
import { Calendar, Clock, MapPin, Video, Phone, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import type { EventType, BookingFormField } from '@prisma/client';

interface BookingPageProps {
  params: {
    username: string;
    slug: string;
  };
  searchParams: {
    event?: string;
  };
}

export default async function PublicBookingPage({ params, searchParams }: BookingPageProps) {
  const { username, slug } = params;
  const preselectedEventId = searchParams?.event;

  // Find the user by username (case-insensitive) with their active booking page
  const user = await getBookingPageData(username, slug);

  if (!user || !user.bookingPages[0]) {
    notFound();
  }

  const bookingPage = user.bookingPages[0];

  // Customizable public branding (accent color + optional logo)
  const brandColor = bookingPage.brandColor || '#6366f1';
  const logoUrl = bookingPage.logoUrl || null;

  // Owner-only share bar (Calendly-style)
  const session = await getServerSession(authOptions);
  const isOwner =
    !!session?.user &&
    !!(session.user as any).id &&
    (session.user as any).id === user.id;

  if (!bookingPage.isActive) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-cyan-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center">
          <div className="bg-white rounded-lg shadow-lg p-8">
            <Calendar className="mx-auto h-12 w-12 text-gray-400 mb-4" />
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              Página no disponible
            </h1>
            <p className="text-gray-600">
              Esta página de reserva está inactiva actualmente.
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
    <div className={`min-h-screen bg-gradient-to-br from-indigo-50 via-white to-cyan-50 ${isOwner ? 'pb-24' : ''}`}>
      {/* Header */}
      <header className="border-b bg-white/80 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div className="flex items-center">
              {logoUrl ? (
                // Custom logo: hide the Anytimebot wordmark so the page feels like the business's own brand
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoUrl} alt={bookingPage.title} className="h-9 w-auto object-contain" />
              ) : (
                <>
                  <Image
                    src="/Anytimebot-icon.png"
                    alt="Anytimebot"
                    width={36}
                    height={36}
                    className="mr-3 object-contain"
                    unoptimized
                  />
                  <span className="text-2xl font-bold text-gray-900">ANYTIMEBOT</span>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Marketing banner for one-time BASIC plan holders (owner only) */}
      {isOwner && user.plan === 'BASIC' && (
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
          <Link
            href="/pricing"
            className="flex items-center justify-between gap-4 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-5 py-4 text-white shadow-md transition-transform hover:scale-[1.01]"
          >
            <div>
              <p className="font-semibold">
                🚀 Lleva tu negocio al siguiente nivel con Anytimebot
              </p>
              <p className="text-sm text-indigo-100 mt-0.5">
                Desbloquea equipos, chatbot con IA, más páginas de reserva y pagos recurrentes.
              </p>
            </div>
            <span className="shrink-0 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-indigo-700">
              Mejorar plan
            </span>
          </Link>
        </div>
      )}

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <Link
          href={`/${username}`}
          className="inline-flex items-center text-sm mb-6"
          style={{ color: brandColor }}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Volver a todos los eventos
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
                  Tipos de eventos disponibles
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
                      <span>{eventType.duration} minutos</span>
                    </div>
                    <div className="flex items-center text-sm text-gray-600 mt-1">
                      {getLocationIcon(eventType.location)}
                      <span className="ml-1 capitalize">
                        {eventType.location}
                      </span>
                    </div>
                    {eventType.collectPayment && eventType.price > 0 && (
                      <div className="flex items-center text-sm font-semibold text-emerald-600 mt-2">
                        <span>{(eventType.price / 100).toFixed(2)} {eventType.currency.toUpperCase()}
                          {eventType.paymentInterval === 'MONTH' ? ' / mes' : eventType.paymentInterval === 'YEAR' ? ' / año' : ''}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right Column - Booking Form */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-lg shadow-lg p-6">
              <h3 className="text-2xl font-bold text-gray-900 mb-6">
                Agenda tu reunión
              </h3>
              <BookingForm
                bookingPage={bookingPage}
                eventTypes={bookingPage.eventTypes}
                availability={bookingPage.availability}
                timezone={user.timezone}
                preselectedEventId={preselectedEventId}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Owner share bar */}
      {isOwner && user.username && (
        <OwnerShareBar username={user.username} slug={bookingPage.slug} />
      )}          {/* Footer */}
      <footer className="bg-white border-t mt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex items-center justify-center">
            <div className="flex items-center">
              {/* Footer always keeps the Anytimebot branding, even with a custom logo */}
              <Image
                src="/Anytimebot-icon.png"
                alt="Anytimebot"
                width={24}
                height={24}
                className="mr-2 object-contain"
                unoptimized
              />
              <span className="text-gray-900 font-semibold">ANYTIMEBOT</span>
            </div>
            <p className="text-gray-500 ml-4">
              © {new Date().getFullYear()} ANYTIMEBOT. Agendar nunca fue tan sencillo.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
