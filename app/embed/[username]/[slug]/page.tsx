import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getBookingPageData } from '@/lib/public-booking';
import { BookingForm } from '@/components/public/booking-form';

interface EmbedBookingPageProps {
  params: {
    username: string;
    slug: string;
  };
}

export const metadata: Metadata = {
  title: 'Reserva - ANYTIMEBOT',
  robots: { index: false, follow: false },
};

/**
 * Compact, iframe-friendly booking page used by the embeddable widget
 * (public/widget.js). No site chrome: just the page title and the
 * booking form on a white, transparent-ready background.
 */
export default async function EmbedBookingPage({ params }: EmbedBookingPageProps) {
  const { username, slug } = params;

  const user = await getBookingPageData(username, slug);

  if (!user || !user.bookingPages[0]) {
    notFound();
  }

  const bookingPage = user.bookingPages[0];

  if (!bookingPage.isActive) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <div className="flex-1 p-3 sm:p-4">
        <div className="mb-3">
          <h1 className="text-lg font-bold text-gray-900 leading-tight">
            {bookingPage.title}
          </h1>
          {bookingPage.description && (
            <p className="text-sm text-gray-600 mt-0.5">{bookingPage.description}</p>
          )}
        </div>
        <BookingForm
          bookingPage={bookingPage}
          eventTypes={bookingPage.eventTypes}
          availability={bookingPage.availability}
          timezone={user.timezone}
        />
      </div>

      {/* Marketing banner for BASIC plan: always visible on embedded widgets
          (opens in a new tab so it never navigates the host website) */}
      {user.plan === 'BASIC' && (
        <div className="p-3 border-t border-gray-200 bg-gradient-to-r from-indigo-600 to-violet-600">
          <a
            href="/pricing"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 text-white text-center"
          >
            <span className="text-sm font-semibold">
              🚀 ¿Quieres tu propia agenda profesional? Crea tu calendario con Anytimebot
            </span>
            <span className="shrink-0 rounded-md bg-white px-2.5 py-1 text-xs font-bold text-indigo-700">
              Saber más
            </span>
          </a>
        </div>
      )}
    </div>
  );
}
