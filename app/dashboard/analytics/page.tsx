
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import dynamic from 'next/dynamic';
import { Suspense } from 'react';

// Lazy load heavy analytics components to reduce build memory usage
const AnalyticsOverview = dynamic(() => import('@/components/dashboard/analytics/analytics-overview').then(mod => ({ default: mod.AnalyticsOverview })), {
  loading: () => <div className="h-32 bg-gray-100 animate-pulse rounded-lg" />,
  ssr: false
});

const BookingAnalytics = dynamic(() => import('@/components/dashboard/analytics/booking-analytics').then(mod => ({ default: mod.BookingAnalytics })), {
  loading: () => <div className="h-96 bg-gray-100 animate-pulse rounded-lg" />,
  ssr: false
});

const BotAnalytics = dynamic(() => import('@/components/dashboard/analytics/bot-analytics').then(mod => ({ default: mod.BotAnalytics })), {
  loading: () => <div className="h-96 bg-gray-100 animate-pulse rounded-lg" />,
  ssr: false
});

const ConversionMetrics = dynamic(() => import('@/components/dashboard/analytics/conversion-metrics').then(mod => ({ default: mod.ConversionMetrics })), {
  loading: () => <div className="h-64 bg-gray-100 animate-pulse rounded-lg" />,
  ssr: false
});

export const metadata = {
  title: 'Analytics & Reports - ANYTIMEBOT',
  description: 'View detailed analytics and reports for your bookings and bot conversations',
};

export default async function AnalyticsPage() {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect('/login');
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Analytics & Reports</h1>
          <p className="text-gray-600 mt-1">
            Track your performance and get insights into your bookings and bot interactions
          </p>
        </div>
      </div>

      {/* Overview Cards */}
      <Suspense fallback={<div className="h-32 bg-gray-100 animate-pulse rounded-lg" />}>
        <AnalyticsOverview />
      </Suspense>

      {/* Booking Analytics */}
      <Suspense fallback={<div className="h-96 bg-gray-100 animate-pulse rounded-lg" />}>
        <BookingAnalytics />
      </Suspense>

      {/* Conversion Metrics */}
      <Suspense fallback={<div className="h-64 bg-gray-100 animate-pulse rounded-lg" />}>
        <ConversionMetrics />
      </Suspense>

      {/* Bot Analytics */}
      <Suspense fallback={<div className="h-96 bg-gray-100 animate-pulse rounded-lg" />}>
        <BotAnalytics />
      </Suspense>
    </div>
  );
}
