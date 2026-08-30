import { BookingPagesList } from '@/components/dashboard/booking-pages/booking-pages-list';
import { BookingPagesHeader } from '@/components/dashboard/booking-pages/booking-pages-header';

export const metadata = {
  title: 'Páginas de reserva - ANYTIMEBOT',
  description: 'Gestiona tus páginas de reserva',
};

export default function BookingPagesPage() {
  return (
    <div className="space-y-6">
      <BookingPagesHeader />
      <BookingPagesList />
    </div>
  );
}
