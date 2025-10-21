
'use client';

import { useState } from 'react';
import { Check, X, Zap, Users, MessageCircle, Video, Bot, TrendingUp } from 'lucide-react';
import { PLAN_CONFIG, type PlanTier } from '@/lib/plans';
import { loadStripe } from '@stripe/stripe-js';
import { useTranslation } from '@/lib/i18n/hooks';

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || '');

interface PricingContentProps {
  currentPlan: string;
  hasActiveSubscription: boolean;
  isLoggedIn: boolean;
}

export function PricingContent({ currentPlan, hasActiveSubscription, isLoggedIn }: PricingContentProps) {
  const [loading, setLoading] = useState<string | null>(null);
  const { t } = useTranslation();

  const handleUpgrade = async (planKey: PlanTier) => {
    if (planKey === 'ENTERPRISE') {
      window.location.href = 'mailto:sales@anytimebot.app?subject=Enterprise Plan Inquiry';
      return;
    }

    if (!isLoggedIn) {
      window.location.href = '/signup';
      return;
    }

    if (planKey === currentPlan) {
      window.location.href = '/dashboard';
      return;
    }

    setLoading(planKey);

    try {
      const response = await fetch('/api/stripe/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priceId: PLAN_CONFIG[planKey].priceId }),
      });

      const { sessionId, error } = await response.json();

      if (error) {
        alert(error);
        setLoading(null);
        return;
      }

      const stripe = await stripePromise;
      if (!stripe) {
        alert('Failed to load payment system');
        setLoading(null);
        return;
      }

      const result = await (stripe as any).redirectToCheckout({ sessionId });
      const redirectError = result?.error;

      if (redirectError) {
        alert(redirectError.message);
      }
    } catch (error) {
      console.error('Upgrade error:', error);
      alert('Something went wrong. Please try again.');
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      {/* Hero Section */}
      <div className="text-center mb-16">
        <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 mb-4">
          {t('pricing.title')}
        </h1>
        <p className="text-xl text-gray-600 max-w-2xl mx-auto">
          {t('pricing.subtitle')}
        </p>
      </div>

      {/* Pricing Cards */}
      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8 mb-16">
        {(Object.keys(PLAN_CONFIG) as PlanTier[]).map((planKey) => {
          const plan = PLAN_CONFIG[planKey];
          const isCurrentPlan = planKey === currentPlan;
          const isPopular = plan.popular;
          const planKeyLower = planKey.toLowerCase() as 'free' | 'pro' | 'team' | 'enterprise';

          return (
            <div
              key={planKey}
              className={`relative bg-white rounded-2xl shadow-lg border-2 transition-all hover:shadow-xl ${
                isPopular ? 'border-indigo-500 scale-105' : 'border-gray-200'
              }`}
            >
              {isPopular && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                  <span className="inline-flex items-center gap-1 px-4 py-1 rounded-full text-sm font-semibold bg-indigo-600 text-white">
                    <Zap className="w-4 h-4" /> {t('pricing.mostPopular')}
                  </span>
                </div>
              )}

              {isCurrentPlan && hasActiveSubscription && (
                <div className="absolute -top-4 right-4">
                  <span className="inline-flex px-3 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-800">
                    {t('pricing.currentPlan')}
                  </span>
                </div>
              )}

              <div className="p-8">
                <h3 className="text-2xl font-bold text-gray-900 mb-2">{t(`pricing.plans.${planKeyLower}.name`)}</h3>
                <p className="text-gray-600 mb-6">{t(`pricing.plans.${planKeyLower}.description`)}</p>

                <div className="mb-6">
                  {plan.price === 0 && planKey !== 'ENTERPRISE' ? (
                    <div className="flex items-baseline">
                      <span className="text-5xl font-bold text-gray-900">$0</span>
                      <span className="text-gray-600 ml-2">{t('pricing.perMonth')}</span>
                    </div>
                  ) : planKey === 'ENTERPRISE' ? (
                    <div className="flex items-baseline">
                      <span className="text-3xl font-bold text-gray-900">{t('pricing.custom')}</span>
                    </div>
                  ) : (
                    <div className="flex items-baseline">
                      <span className="text-5xl font-bold text-gray-900">${plan.price}</span>
                      <span className="text-gray-600 ml-2">{t('pricing.perMonth')}</span>
                    </div>
                  )}
                </div>

                <button
                  onClick={() => handleUpgrade(planKey)}
                  disabled={loading === planKey || (isCurrentPlan && hasActiveSubscription)}
                  className={`w-full py-3 px-4 rounded-lg font-semibold transition-colors ${
                    isCurrentPlan && hasActiveSubscription
                      ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                      : isPopular
                      ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                      : 'bg-gray-900 text-white hover:bg-gray-800'
                  }`}
                >
                  {loading === planKey ? t('common.loading') : isCurrentPlan && hasActiveSubscription ? t('pricing.currentPlan') : t(`pricing.plans.${planKeyLower}.cta`)}
                </button>

                <ul className="mt-8 space-y-4">
                  {t(`pricing.plans.${planKeyLower}.features`, { returnObjects: true }) && 
                    (t(`pricing.plans.${planKeyLower}.features`, { returnObjects: true }) as string[]).map((feature, idx) => (
                      <li key={idx} className="flex items-start gap-3">
                        <Check className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                        <span className="text-gray-700 text-sm">{feature}</span>
                      </li>
                    ))}
                </ul>
              </div>
            </div>
          );
        })}
      </div>

      {/* Feature Comparison Table */}
      <div className="bg-white rounded-2xl shadow-lg p-8">
        <h2 className="text-3xl font-bold text-gray-900 mb-8 text-center">{t('pricing.comparisonTitle')}</h2>
        
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b-2 border-gray-200">
                <th className="text-left py-4 px-6 font-semibold text-gray-900">{t('pricing.comparisonTable.feature')}</th>
                <th className="text-center py-4 px-6 font-semibold text-gray-900">{t('pricing.comparisonTable.free')}</th>
                <th className="text-center py-4 px-6 font-semibold text-gray-900">{t('pricing.comparisonTable.pro')}</th>
                <th className="text-center py-4 px-6 font-semibold text-gray-900">{t('pricing.comparisonTable.team')}</th>
                <th className="text-center py-4 px-6 font-semibold text-gray-900">{t('pricing.comparisonTable.enterprise')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              <FeatureRow
                t={t}
                feature={t('pricing.comparisonTable.bookingPages')}
                free="1"
                pro="10"
                team="50"
                enterprise="Unlimited"
              />
              <FeatureRow
                t={t}
                feature={t('pricing.comparisonTable.googleCalendar')}
                free={true}
                pro={true}
                team={true}
                enterprise={true}
              />
              <FeatureRow
                t={t}
                feature={t('pricing.comparisonTable.aiAssistant')}
                free={false}
                pro="200/mo"
                team="500/mo"
                enterprise="Unlimited"
              />
              <FeatureRow
                t={t}
                feature={t('pricing.comparisonTable.botTrainingDocs')}
                free={false}
                pro="5"
                team="50"
                enterprise="Unlimited"
              />
              <FeatureRow
                t={t}
                feature={t('pricing.comparisonTable.videoRooms')}
                free={false}
                pro="100 min/mo"
                team="500 min/mo"
                enterprise="Unlimited"
              />
              <FeatureRow
                t={t}
                feature={t('pricing.comparisonTable.videoRecording')}
                free={false}
                pro={true}
                team={true}
                enterprise={true}
              />
              <FeatureRow
                t={t}
                feature={t('pricing.comparisonTable.whatsapp')}
                free={false}
                pro="Evolution API"
                team="Twilio + Evolution"
                enterprise="Custom"
              />
              <FeatureRow
                t={t}
                feature={t('pricing.comparisonTable.telegram')}
                free={false}
                pro={false}
                team={true}
                enterprise={true}
              />
              <FeatureRow
                t={t}
                feature={t('pricing.comparisonTable.teamScheduling')}
                free={false}
                pro={false}
                team="Up to 5 members"
                enterprise="Unlimited"
              />
              <FeatureRow
                t={t}
                feature={t('pricing.comparisonTable.preMeetingBriefs')}
                free={false}
                pro={true}
                team={true}
                enterprise={true}
              />
              <FeatureRow
                t={t}
                feature={t('pricing.comparisonTable.roundRobin')}
                free={false}
                pro={false}
                team={true}
                enterprise={true}
              />
              <FeatureRow
                t={t}
                feature={t('pricing.comparisonTable.sso')}
                free={false}
                pro={false}
                team={false}
                enterprise={true}
              />
              <FeatureRow
                t={t}
                feature={t('pricing.comparisonTable.dedicatedSupport')}
                free={false}
                pro={false}
                team={false}
                enterprise={true}
              />
            </tbody>
          </table>
        </div>
      </div>

      {/* FAQ Section */}
      <div className="mt-16 max-w-4xl mx-auto">
        <h2 className="text-3xl font-bold text-gray-900 mb-8 text-center">{t('pricing.faqTitle')}</h2>
        
        <div className="space-y-6">
          {t('pricing.faq', { returnObjects: true }) &&
            (t('pricing.faq', { returnObjects: true }) as Array<{question: string; answer: string}>).map((faq, index) => (
              <FAQItem
                key={index}
                question={faq.question}
                answer={faq.answer}
              />
            ))}
        </div>
      </div>
    </div>
  );
}

function FeatureRow({ t, feature, free, pro, team, enterprise }: {
  t: any;
  feature: string;
  free: boolean | string;
  pro: boolean | string;
  team: boolean | string;
  enterprise: boolean | string;
}) {
  const renderCell = (value: boolean | string) => {
    if (typeof value === 'boolean') {
      return value ? (
        <Check className="w-5 h-5 text-green-500 mx-auto" />
      ) : (
        <X className="w-5 h-5 text-gray-300 mx-auto" />
      );
    }
    return <span className="text-gray-700 text-sm">{value}</span>;
  };

  return (
    <tr className="hover:bg-gray-50">
      <td className="py-4 px-6 text-gray-900 font-medium">{feature}</td>
      <td className="py-4 px-6 text-center">{renderCell(free)}</td>
      <td className="py-4 px-6 text-center">{renderCell(pro)}</td>
      <td className="py-4 px-6 text-center">{renderCell(team)}</td>
      <td className="py-4 px-6 text-center">{renderCell(enterprise)}</td>
    </tr>
  );
}

function FAQItem({ question, answer }: { question: string; answer: string }) {
  return (
    <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
      <h3 className="text-lg font-semibold text-gray-900 mb-2">{question}</h3>
      <p className="text-gray-600">{answer}</p>
    </div>
  );
}
