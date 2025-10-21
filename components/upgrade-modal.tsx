
'use client';

import { useState } from 'react';
import { X, Zap, Check } from 'lucide-react';
import { PLAN_CONFIG } from '@/lib/plans';
import { loadStripe } from '@stripe/stripe-js';

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || '');

interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  reason: string;
  recommendedPlan?: 'PRO' | 'TEAM';
}

export function UpgradeModal({ isOpen, onClose, reason, recommendedPlan = 'PRO' }: UpgradeModalProps) {
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const plan = PLAN_CONFIG[recommendedPlan];

  const handleUpgrade = async () => {
    setLoading(true);

    try {
      const response = await fetch('/api/stripe/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priceId: plan.priceId }),
      });

      const { sessionId, error } = await response.json();

      if (error) {
        alert(error);
        setLoading(false);
        return;
      }

      const stripe = await stripePromise;
      if (!stripe) {
        alert('Failed to load payment system');
        setLoading(false);
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
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center p-4">
        {/* Backdrop */}
        <div
          className="fixed inset-0 bg-black bg-opacity-50 transition-opacity"
          onClick={onClose}
        ></div>

        {/* Modal */}
        <div className="relative bg-white rounded-2xl shadow-xl max-w-md w-full p-6 z-50">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Zap className="w-8 h-8 text-indigo-600" />
            </div>
            <h3 className="text-2xl font-bold text-gray-900 mb-2">
              Upgrade to {plan.name}
            </h3>
            <p className="text-gray-600">{reason}</p>
          </div>

          <div className="bg-gray-50 rounded-lg p-4 mb-6">
            <div className="flex items-baseline justify-center mb-4">
              <span className="text-4xl font-bold text-gray-900">${plan.price}</span>
              <span className="text-gray-600 ml-2">/month</span>
            </div>

            <ul className="space-y-3">
              {plan.features.slice(0, 5).map((feature, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <Check className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                  <span className="text-sm text-gray-700">{feature}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="space-y-3">
            <button
              onClick={handleUpgrade}
              disabled={loading}
              className="w-full py-3 px-4 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Loading...' : `Upgrade to ${plan.name} - $${plan.price}/mo`}
            </button>

            <button
              onClick={() => window.location.href = '/pricing'}
              className="w-full py-3 px-4 bg-white text-gray-700 border border-gray-300 rounded-lg font-semibold hover:bg-gray-50 transition-colors"
            >
              View All Plans
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
