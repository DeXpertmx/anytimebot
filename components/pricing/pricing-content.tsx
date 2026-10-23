'use client';

import { useState } from 'react';
import { Check, X, Zap, Bot, Users, CalendarDays, MessageCircle, ArrowRight, Flame, Building2 } from 'lucide-react';
import { loadStripe } from '@stripe/stripe-js';
import { useTranslation } from '@/lib/i18n/hooks';


type PaidPlan = 'FOUNDER' | 'PRO' | 'TEAM' | 'ENTERPRISE';
type PlanKey = 'founder' | 'pro' | 'team' | 'enterprise';

export interface ResellerPricing {
  resellerName: string;
  prices: {
    founder: number;
    pro: number;
    team: number;
    enterprise: number;
  };
}

interface PricingContentProps {
  currentPlan: string;
  hasActiveSubscription: boolean;
  isLoggedIn: boolean;
  resellerPricing?: ResellerPricing | null;
  founderSeatsLeft: number;
}

const PLAN_ORDER: PlanKey[] = ['founder', 'pro', 'team', 'enterprise'];

const PLAN_DETAILS: Record<PlanKey, {
  price: number;
  billingKey: string;
  icon: typeof CalendarDays;
  highlighted?: boolean;
}> = {
  founder: { price: 9, billingKey: 'perMonth', icon: Flame, highlighted: true },
  pro: { price: 19, billingKey: 'perMonth', icon: Bot },
  team: { price: 39, billingKey: 'perMonth', icon: Users },
  enterprise: { price: 79, billingKey: 'perMonth', icon: Building2 },
};

export function PricingContent({ currentPlan, hasActiveSubscription, isLoggedIn, resellerPricing, founderSeatsLeft }: PricingContentProps) {
  const [loading, setLoading] = useState<PlanKey | null>(null);
  const { t } = useTranslation();

  // Reseller pricing overrides the official prices for attributed customers.
  const priceOf = (planKey: PlanKey): number => {
    if (resellerPricing) return resellerPricing.prices[planKey];
    return PLAN_DETAILS[planKey].price;
  };

  const formatPrice = (planKey: PlanKey): string => {
    const value = priceOf(planKey);
    const isWhole = Number.isInteger(value);
    return isWhole ? `€${value}` : `€${value.toFixed(2)}`;
  };

  const handlePlanAction = async (planKey: PlanKey) => {
    if (!isLoggedIn) {
      window.location.href = '/auth/signup';
      return;
    }

    const paidPlan = planKey.toUpperCase() as PaidPlan;

    // A founder seat may sell out between page load and click; fail gracefully.
    if (paidPlan === 'FOUNDER' && currentPlan !== 'FOUNDER' && founderSeatsLeft <= 0) {
      alert(t('pricing.founderSoldOut'));
      return;
    }

    if (paidPlan === currentPlan && hasActiveSubscription) {
      window.location.href = '/dashboard';
      return;
    }

    setLoading(planKey);

    try {
      const response = await fetch('/api/stripe/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: paidPlan }),
      });
      const data = await response.json();

      if (!response.ok || data.error) {
        alert(data.error || t('pricing.checkoutError'));
        return;
      }

      // Plan change on an existing subscription: ask for explicit confirmation
      // before switching the recurring price (Stripe prorates the difference).
      if (data.requiresConfirmation) {
        const currentPlanName = planLabelFor(currentPlan);
        const targetPlanName = t(`pricing.plans.${planKey}.name`);
        const message =
          `${t('pricing.planChangeConfirm')}\n\n` +
          `${t('pricing.currentPlan')}: ${currentPlanName} (€${data.currentPrice}/mes)\n` +
          `${t('pricing.planChangeTarget')}: ${targetPlanName} (€${data.targetPrice}/mes)\n\n` +
          t('pricing.planChangeProration');
        if (!window.confirm(message)) {
          setLoading(null);
          return;
        }
        const confirmResponse = await fetch('/api/stripe/create-checkout-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ plan: paidPlan, confirmed: true }),
        });
        const confirmData = await confirmResponse.json();
        if (!confirmResponse.ok || confirmData.error) {
          alert(confirmData.error || t('pricing.checkoutError'));
          return;
        }
        if (confirmData.url) {
          window.location.href = confirmData.url;
          return;
        }
        setLoading(null);
        return;
      }

      // Redirect to the Stripe-hosted checkout URL. This avoids depending on
      // the publishable key matching the session mode on the client.
      if (data.url) {
        window.location.href = data.url;
        return;
      }

      const stripe = await loadStripe(data.publishableKey || '');
      if (!stripe) {
        alert(t('pricing.paymentUnavailable'));
        return;
      }

      const result = await (stripe as any).redirectToCheckout({ sessionId: data.sessionId });
      if (result?.error) alert(result.error.message);
    } catch (error) {
      console.error('Upgrade error:', error);
      alert(t('pricing.checkoutError'));
    } finally {
      setLoading(null);
    }
  };

  const planLabel = (planKey: PlanKey) => t(`pricing.plans.${planKey}.name`);
  const planLabelFor = (plan: string) => {
    const key = plan.toLowerCase() as PlanKey;
    return PLAN_ORDER.includes(key) ? planLabel(key) : plan;
  };
  const isCurrent = (planKey: PlanKey) =>
    currentPlan === planKey.toUpperCase() && hasActiveSubscription;

  return (
    <main className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
      <section className="mx-auto max-w-3xl text-center">
        <p className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-indigo-600">
          {t('pricing.eyebrow')}
        </p>
        <h1 className="text-4xl font-bold tracking-tight text-gray-950 sm:text-5xl">
          {t('pricing.title')}
        </h1>
        <p className="mt-5 text-lg leading-8 text-gray-600">
          {t('pricing.subtitle')}
        </p>
      </section>

      <div className="mx-auto mt-8 max-w-3xl rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-center">
        <p className="text-sm font-semibold text-amber-900">
          {t('pricing.founderBanner')}
        </p>
      </div>

      <section className="mx-auto mt-12 grid max-w-7xl gap-6 lg:grid-cols-4" aria-label={t('pricing.plansLabel')}>
        {PLAN_ORDER.map((planKey) => {
          const details = PLAN_DETAILS[planKey];
          const Icon = details.icon;
          const current = isCurrent(planKey);
          const soldOut = planKey === 'founder' && !current && founderSeatsLeft <= 0;
          const features = t(`pricing.plans.${planKey}.features`, { returnObjects: true }) as string[];

          return (
            <article
              key={planKey}
              className={`relative flex flex-col border bg-white p-7 shadow-sm transition-shadow hover:shadow-md ${
                details.highlighted ? 'border-amber-400 shadow-amber-100' : 'border-gray-200'
              }`}
            >
              {details.highlighted && (
                <div className="absolute inset-x-0 top-0 bg-amber-500 px-4 py-2 text-center text-xs font-bold uppercase tracking-wide text-white">
                  {t('pricing.founderBadge')}
                </div>
              )}

              <div className={details.highlighted ? 'pt-5' : ''}>
                <div className="flex items-center gap-3">
                  <div className={`flex h-10 w-10 items-center justify-center ${
                    details.highlighted ? 'bg-amber-50 text-amber-600' : 'bg-indigo-50 text-indigo-600'
                  }`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-gray-950">{planLabel(planKey)}</h2>
                    <p className="mt-1 text-sm text-gray-500">{t(`pricing.plans.${planKey}.description`)}</p>
                  </div>
                </div>

                <div className="mt-7 flex items-end gap-2">
                  <span className="text-5xl font-bold tracking-tight text-gray-950">{formatPrice(planKey)}</span>
                  <span className="mb-1 text-sm text-gray-500">{t(`pricing.${details.billingKey}`)}</span>
                </div>

                {resellerPricing && (
                  <p className="mt-3 rounded-md bg-indigo-50 px-3 py-2 text-center text-xs font-medium text-indigo-700">
                    {t('pricing.resellerProvidedBy', { name: resellerPricing.resellerName })}
                  </p>
                )}

                <button
                  type="button"
                  onClick={() => handlePlanAction(planKey)}
                  disabled={current || loading !== null || soldOut}
                  className={`mt-7 flex w-full items-center justify-center gap-2 px-4 py-3 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                    details.highlighted
                      ? 'bg-amber-500 text-white hover:bg-amber-600'
                      : 'bg-gray-950 text-white hover:bg-gray-800'
                  }`}
                >
                  {loading === planKey
                    ? t('common.loading')
                    : current
                      ? t('pricing.currentPlan')
                      : soldOut
                        ? t('pricing.founderSoldOutCta')
                        : t(`pricing.plans.${planKey}.cta`)}
                  {!current && !soldOut && loading !== planKey && <ArrowRight className="h-4 w-4" />}
                </button>

                {planKey === 'founder' && (
                  <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4">
                    <p className="text-sm font-bold text-amber-900">
                      {founderSeatsLeft > 0
                        ? t('pricing.founderSeatsLeft', { count: founderSeatsLeft })
                        : t('pricing.founderSoldOut')}
                    </p>
                    <p className="mt-1 text-sm text-amber-800">
                      {t('pricing.founderPromoText')}
                    </p>
                  </div>
                )}

                <ul className="mt-8 space-y-3 border-t border-gray-100 pt-6">
                  {features.map((feature) => (
                    <li key={feature} className="flex items-start gap-3 text-sm text-gray-700">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </article>
          );
        })}
      </section>

      <section className="mx-auto mt-16 max-w-6xl border-y border-gray-200 py-10">
        <div className="mb-8 text-center">
          <h2 className="text-2xl font-bold text-gray-950">{t('pricing.comparisonTitle')}</h2>
          <p className="mt-2 text-gray-600">{t('pricing.comparisonSubtitle')}</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="px-4 py-3 font-semibold text-gray-950">{t('pricing.comparisonTable.feature')}</th>
                {PLAN_ORDER.map((planKey) => (
                  <th key={planKey} className="px-4 py-3 text-center font-semibold text-gray-950">{planLabel(planKey)}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              <ComparisonRow label={t('pricing.comparisonTable.bookingPages')} values={['10', '10', '50', t('pricing.comparisonTable.moreCapacity')]} />
              <ComparisonRow label={t('pricing.comparisonTable.customers')} values={['10.000', '10.000', '50.000', t('pricing.comparisonTable.moreCapacity')]} />
              <ComparisonRow label={t('pricing.comparisonTable.googleCalendar')} values={[true, true, true, true]} />
              <ComparisonRow label={t('pricing.comparisonTable.aiAssistant')} values={[t('pricing.comparisonTable.aiPro'), t('pricing.comparisonTable.aiPro'), t('pricing.comparisonTable.aiTeam'), t('pricing.comparisonTable.unlimited')]} />
              <ComparisonRow label={t('pricing.comparisonTable.whatsapp')} values={[true, true, true, true]} />
              <ComparisonRow label={t('pricing.comparisonTable.customerFeedback')} values={[true, true, true, true]} />
              <ComparisonRow label={t('pricing.comparisonTable.teamScheduling')} values={[false, false, t('pricing.comparisonTable.upToFiveUsers'), true]} />
              <ComparisonRow label={t('pricing.comparisonTable.payments')} values={[true, true, true, true]} />
              <ComparisonRow label={t('pricing.comparisonTable.sso')} values={[false, false, false, true]} />
              <ComparisonRow label={t('pricing.comparisonTable.dedicatedSupport')} values={[false, false, false, true]} />
            </tbody>
          </table>
        </div>
      </section>

      <section className="mx-auto mt-14 grid max-w-5xl gap-5 md:grid-cols-3">
        <InfoItem icon={MessageCircle} title={t('pricing.value.whatsappTitle')} text={t('pricing.value.whatsappText')} />
        <InfoItem icon={Bot} title={t('pricing.value.botTitle')} text={t('pricing.value.botText')} />
        <InfoItem icon={Zap} title={t('pricing.value.launchTitle')} text={t('pricing.value.launchText')} />
      </section>

      <p className="mx-auto mt-12 max-w-2xl text-center text-sm text-gray-500">
        {t('pricing.launchNote')}
      </p>
    </main>
  );
}

function ComparisonRow({ label, values }: { label: string; values: Array<boolean | string> }) {
  return (
    <tr className="hover:bg-gray-50">
      <td className="px-4 py-3 font-medium text-gray-800">{label}</td>
      {values.map((value, index) => (
        <td key={index} className="px-4 py-3 text-center text-gray-700">
          {typeof value === 'boolean' ? (
            value ? <Check className="mx-auto h-4 w-4 text-emerald-600" /> : <X className="mx-auto h-4 w-4 text-gray-300" />
          ) : value}
        </td>
      ))}
    </tr>
  );
}

function InfoItem({ icon: Icon, title, text }: { icon: typeof MessageCircle; title: string; text: string }) {
  return (
    <div className="border border-gray-200 p-5">
      <Icon className="h-5 w-5 text-indigo-600" />
      <h3 className="mt-3 font-semibold text-gray-950">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-gray-600">{text}</p>
    </div>
  );
}
