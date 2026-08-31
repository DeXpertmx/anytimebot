
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import dynamic from 'next/dynamic';
import { prisma } from '@/lib/db';
import { initializeUserQuotas } from '@/lib/plans';
import { PlanBadge } from '@/components/dashboard/plan-badge';
import { PaymentSuccessBanner } from '@/components/dashboard/payment-success-banner';

const DashboardOverview = dynamic(() => import('@/components/dashboard/dashboard-overview').then(mod => ({ default: mod.DashboardOverview })), {
  ssr: false,
  loading: () => (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="h-24 bg-gray-200 rounded animate-pulse"></div>
      ))}
    </div>
  )
});

const UsageStats = dynamic(() => import('@/components/dashboard/usage-stats').then(mod => ({ default: mod.UsageStats })), {
  ssr: false,
  loading: () => (
    <div className="h-64 bg-gray-200 rounded animate-pulse"></div>
  )
});

export const metadata = {
  title: 'Dashboard - ANYTIMEBOT',
  description: 'Manage your bookings and scheduling',
};

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { payment?: string; plan?: string };
}) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return null;
  }

  // Get user and ensure quotas are initialized
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: {
      quotas: true,
      usage: true,
    },
  });

  // Initialize quotas if not present
  if (user && !user.quotas) {
    await initializeUserQuotas(user.id, user.plan as any);
  }

  return (
    <div className="min-w-0 space-y-6 pb-6">
      <PaymentSuccessBanner payment={searchParams?.payment} plan={searchParams?.plan} />
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">
            {session?.user?.name ? `¡Bienvenido de nuevo, ${session.user.name}!` : '¡Bienvenido de nuevo!'}
          </h1>
          <p className="text-gray-600 mt-1">
            Esto es lo que está sucediendo con tu agenda
          </p>
        </div>
        {user && <PlanBadge plan={user.plan as any} />}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <DashboardOverview />
        </div>
        <div>
          <UsageStats />
        </div>
      </div>
    </div>
  );
}
