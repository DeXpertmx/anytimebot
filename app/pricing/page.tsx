
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { PricingContent } from '@/components/pricing/pricing-content';
import { prisma } from '@/lib/db';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Pricing - ANYTIMEBOT',
  description: 'Choose the perfect plan for your scheduling needs. From free to enterprise, we have a plan for everyone.',
  openGraph: {
    title: 'Pricing - ANYTIMEBOT',
    description: 'Transparent pricing for every team size',
  },
};

export default async function PricingPage() {
  const session = await getServerSession(authOptions);
  
  let currentPlan = 'FREE';
  let hasActiveSubscription = false;
  
  if (session?.user?.id) {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { plan: true, subscriptionStatus: true },
    });
    
    if (user) {
      currentPlan = user.plan;
      hasActiveSubscription = user.subscriptionStatus === 'ACTIVE';
    }
  }
  
  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
      {/* Header */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <img 
                src="/Anytimebot-logo.png" 
                alt="ANYTIMEBOT Logo" 
                width={200}
                height={60}
                className="h-[60px] w-[200px] object-contain"
              />
            </div>
            {session ? (
              <a
                href="/dashboard"
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900"
              >
                Back to Dashboard
              </a>
            ) : (
              <div className="flex gap-3">
                <a
                  href="/signin"
                  className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900"
                >
                  Sign In
                </a>
                <a
                  href="/signup"
                  className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700"
                >
                  Sign Up
                </a>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Pricing Content */}
      <PricingContent 
        currentPlan={currentPlan} 
        hasActiveSubscription={hasActiveSubscription}
        isLoggedIn={!!session}
      />
    </div>
  );
}
