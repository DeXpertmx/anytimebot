
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { BookingPagesList } from '@/components/dashboard/booking-pages/booking-pages-list';
import { CreateBookingPageDialog } from '@/components/dashboard/booking-pages/create-booking-page-dialog';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';

export const metadata = {
  title: 'Booking Pages - ANYTIMEBOT',
  description: 'Manage your booking pages',
};

export default async function BookingPagesPage() {
  const session = await getServerSession(authOptions);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Booking Pages</h1>
          <p className="text-gray-600 mt-1">
            Create and manage your booking pages
          </p>
        </div>
        <CreateBookingPageDialog>
          <Button className="bg-indigo-600 hover:bg-indigo-700">
            <Plus className="mr-2 h-4 w-4" />
            Create Page
          </Button>
        </CreateBookingPageDialog>
      </div>
      <BookingPagesList />
    </div>
  );
}
