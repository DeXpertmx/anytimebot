
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { initializeUserQuotas, PLAN_CONFIG } from '@/lib/plans';
import WhatsAppSettings from './whatsapp-settings';
import { Lock, Zap, MessageCircle } from 'lucide-react';
import Link from 'next/link';

export default async function WhatsAppPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect('/auth/signin');
  }

  // Get user with quotas
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: {
      quotas: true,
    },
  });

  if (!user) {
    redirect('/auth/signin');
  }

  // Initialize quotas if not present
  if (!user.quotas) {
    await initializeUserQuotas(user.id, user.plan as any);
    redirect('/dashboard/whatsapp'); // Refresh to get quotas
  }

  const canUseWhatsApp = user.quotas.canUseWhatsApp;
  const canUseEvolution = user.quotas.canUseEvolution;
  const canUseTwilio = user.quotas.canUseTwilio;

  // If user doesn't have WhatsApp access, show upgrade prompt
  if (!canUseWhatsApp) {
    return (
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-6">WhatsApp Integration</h1>

        <div className="bg-white rounded-lg shadow-lg p-8 text-center">
          <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <Lock className="w-10 h-10 text-gray-400" />
          </div>

          <h2 className="text-2xl font-bold text-gray-900 mb-3">
            WhatsApp Integration Requires Pro Plan
          </h2>

          <p className="text-gray-600 mb-8 max-w-lg mx-auto">
            Connect your WhatsApp to automatically notify guests, send reminders, and enable 
            conversational booking with your AI assistant.
          </p>

          <div className="grid md:grid-cols-2 gap-6 mb-8 text-left max-w-2xl mx-auto">
            <div className="bg-indigo-50 rounded-lg p-6">
              <div className="flex items-start gap-3 mb-4">
                <MessageCircle className="w-6 h-6 text-indigo-600 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-gray-900 mb-1">Pro Plan</h3>
                  <p className="text-sm text-gray-700 mb-3">Evolution API integration</p>
                  <p className="text-3xl font-bold text-gray-900">$19<span className="text-base font-normal text-gray-600">/mo</span></p>
                </div>
              </div>
              <ul className="space-y-2 text-sm text-gray-700">
                <li className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-indigo-600" />
                  1,000 WhatsApp messages/mo
                </li>
                <li className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-indigo-600" />
                  AI Assistant with WhatsApp
                </li>
                <li className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-indigo-600" />
                  Automatic reminders
                </li>
              </ul>
            </div>

            <div className="bg-purple-50 rounded-lg p-6 border-2 border-purple-300">
              <div className="flex items-start gap-3 mb-4">
                <MessageCircle className="w-6 h-6 text-purple-600 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-gray-900 mb-1">Team Plan</h3>
                  <p className="text-sm text-gray-700 mb-3">Twilio + Evolution APIs</p>
                  <p className="text-3xl font-bold text-gray-900">$49<span className="text-base font-normal text-gray-600">/mo</span></p>
                </div>
              </div>
              <ul className="space-y-2 text-sm text-gray-700">
                <li className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-purple-600" />
                  5,000 WhatsApp messages/mo
                </li>
                <li className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-purple-600" />
                  Enterprise-grade Twilio
                </li>
                <li className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-purple-600" />
                  Telegram included
                </li>
              </ul>
            </div>
          </div>

          <div className="flex gap-4 justify-center">
            <Link
              href="/pricing"
              className="inline-flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 transition-colors"
            >
              <Zap className="w-5 h-5" />
              View All Plans
            </Link>
            <Link
              href="/dashboard"
              className="inline-flex px-6 py-3 bg-white text-gray-700 border border-gray-300 rounded-lg font-semibold hover:bg-gray-50 transition-colors"
            >
              Back to Dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // User has WhatsApp access, show settings
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">WhatsApp Integration</h1>
        <p className="text-gray-600">
          {canUseTwilio 
            ? 'Configure Evolution API or Twilio for enterprise-grade WhatsApp messaging'
            : 'Configure Evolution API for WhatsApp messaging'}
        </p>
      </div>
      <WhatsAppSettings 
        canUseEvolution={canUseEvolution}
        canUseTwilio={canUseTwilio}
      />
    </div>
  );
}
