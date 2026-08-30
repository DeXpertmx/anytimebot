import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { AvailabilityManager } from '@/components/dashboard/availability/availability-manager';
import { TimeOffManager } from '@/components/dashboard/availability/time-off-manager';
import { AvailabilityHeader } from '@/components/dashboard/availability/availability-header';

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
    <div className="min-w-0 space-y-6 pb-8">
      <AvailabilityHeader />
      <AvailabilityManager />
      <TimeOffManager />
    </div>
  );
}
