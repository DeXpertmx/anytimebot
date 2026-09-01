
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { DashboardSidebar } from '@/components/dashboard/dashboard-sidebar';
import dynamic from 'next/dynamic';
import { MobileBottomNav } from '@/components/dashboard/mobile-bottom-nav';

const DashboardHeader = dynamic(() => import('@/components/dashboard/dashboard-header').then(mod => ({ default: mod.DashboardHeader })), {
  ssr: false,
  loading: () => <div className="h-16 border-b border-gray-200 bg-white"></div>
});

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);
  
  if (!session) {
    redirect('/auth/signin');
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <DashboardSidebar />
      <div className="pl-0 md:pl-64 min-w-0">
        <DashboardHeader />
        <main className="h-[calc(100vh-4rem)] min-h-0 overflow-y-auto overflow-x-hidden p-4 pb-24 sm:p-6 sm:pb-6">
          {children}
        </main>
        <MobileBottomNav />
      </div>
    </div>
  );
}
