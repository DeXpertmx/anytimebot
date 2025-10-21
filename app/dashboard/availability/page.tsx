
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { AvailabilityManager } from '@/components/dashboard/availability/availability-manager';

export const metadata = {
  title: 'Availability - ANYTIMEBOT',
  description: 'Manage your availability',
};

export default async function AvailabilityPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    redirect('/auth/signin');
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Availability</h1>
        <p className="text-gray-600 mt-1">
          Set your working hours and availability for bookings
        </p>
      </div>
      <AvailabilityManager />
    </div>
  );
}
