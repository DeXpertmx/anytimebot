'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, X } from 'lucide-react';

const PLAN_LABELS: Record<string, string> = {
  BASIC: 'Básico de fundadores',
  PRO: 'Pro',
  TEAM: 'Equipo',
};

/**
 * Shows a confirmation banner when the user returns from the Stripe checkout
 * (?payment=success&plan=...), then removes the query params from the URL so
 * the banner does not reappear on refresh.
 */
export function PaymentSuccessBanner({ payment, plan }: { payment?: string; plan?: string }) {
  const [visible, setVisible] = useState(payment === 'success');

  useEffect(() => {
    if (payment === 'success') {
      const url = new URL(window.location.href);
      url.searchParams.delete('payment');
      url.searchParams.delete('plan');
      url.searchParams.delete('session_id');
      window.history.replaceState({}, '', url.toString());
    }
  }, [payment]);

  if (!visible) return null;

  const planLabel = plan ? PLAN_LABELS[plan] || plan : null;

  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
      <div className="flex items-start gap-3">
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
        <div>
          <p className="font-semibold text-emerald-900">
            Pago recibido con éxito
          </p>
          <p className="mt-1 text-sm text-emerald-800">
            {planLabel
              ? `Tu plan ${planLabel} ya está activo. ¡Bienvenido!`
              : 'Tu plan ya está activo. ¡Bienvenido!'}
          </p>
        </div>
      </div>
      <button
        type="button"
        aria-label="Cerrar"
        onClick={() => setVisible(false)}
        className="text-emerald-700 hover:text-emerald-900"
      >
        <X className="h-5 w-5" />
      </button>
    </div>
  );
}