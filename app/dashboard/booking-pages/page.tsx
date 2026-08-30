import { BookingPagesList } from '@/components/dashboard/booking-pages/booking-pages-list';
import { BookingPagesHeader } from '@/components/dashboard/booking-pages/booking-pages-header';

export const metadata = {
  title: 'Booking Pages - ANYTIMEBOT',
  description: 'Manage your booking pages',
};

export default function BookingPagesPage() {
  return (
    <div className="space-y-6">
      <BookingPagesHeader />
      <BookingPagesList />
    </div>
  );
}
