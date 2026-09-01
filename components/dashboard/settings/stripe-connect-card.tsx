'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, CreditCard, ExternalLink, CheckCircle2, XCircle, RefreshCw } from 'lucide-react';

interface ConnectStatus {
  accountId: string | null;
  status: 'never' | 'pending' | 'connected' | 'rejected';
  detailsSubmitted: boolean;
  chargesEnabled: boolean;
}

export function StripeConnectCard() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<ConnectStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);

  const loadStatus = async () => {
    try {
      const res = await fetch('/api/stripe/connect/status');
      if (res.ok) {
        const data = await res.json();
        if (data.success) setStatus(data.data);
      }
    } catch {
      // Ignore; card shows loading->idle
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // After returning from Stripe onboarding, refresh the status automatically
  // so the UI reflects the newly connected account without a manual reload.
  useEffect(() => {
    if (searchParams.get('stripe') === 'return' || searchParams.get('stripe') === 'refresh') {
      loadStatus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const handleConnect = async () => {
    setStarting(true);
    try {
      const res = await fetch('/api/stripe/connect/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (data.success && data.data?.url) {
        window.location.href = data.data.url;
      } else {
        alert(data.error || 'No se pudo iniciar la conexión con Stripe');
      }
    } catch {
      alert('No se pudo iniciar la conexión con Stripe');
    } finally {
      setStarting(false);
    }
  };

  const connected = status?.status === 'connected';

  return (
    <Card className="p-6">
      <div className="flex items-center mb-4">
        <CreditCard className="h-5 w-5 text-indigo-600 mr-2" />
        <h2 className="text-xl font-semibold text-gray-900">Pagos y cobros</h2>
      </div>

      {status?.status === 'never' && (
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Conecta tu propia cuenta de Stripe para recibir directamente en tu banco el dinero de las
            reservas pagadas. Sin comisiones por transacción: cobras el 100% de cada reserva.
          </p>
          <div className="rounded-lg bg-slate-50 p-4 text-sm text-slate-700 space-y-1">
            <p className="font-medium text-slate-900">¿Qué necesitas?</p>
            <p>• Un correo electrónico de tu negocio</p>
            <p>• Los datos fiscales de tu empresa o actividad (Stripe verifica tu identidad)</p>
            <p>• Una cuenta bancaria donde recibir los pagos</p>
          </div>
          <Button
            onClick={handleConnect}
            disabled={starting}
            className="bg-indigo-600 hover:bg-indigo-700"
          >
            {starting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ExternalLink className="mr-2 h-4 w-4" />}
            Conectar Stripe
          </Button>
        </div>
      )}

      {(status?.status === 'pending') && (
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <RefreshCw className="mt-0.5 h-5 w-5 text-amber-500 shrink-0" />
            <div>
              <p className="font-medium text-gray-900">Conexión en proceso</p>
              <p className="text-sm text-gray-600 mt-1">
                {status.detailsSubmitted
                  ? 'Stripe está revisando tu cuenta. Vuelve en unos minutos o pulsa el botón para comprobar el estado.'
                  : 'Completa la verificación de tu negocio en Stripe para empezar a recibir pagos.'}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={handleConnect} disabled={starting} variant="outline">
              {starting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ExternalLink className="mr-2 h-4 w-4" />}
              Continuar en Stripe
            </Button>
            <Button variant="outline" onClick={loadStatus} disabled={loading}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Comprobar estado
            </Button>
          </div>
        </div>
      )}

      {status?.status === 'rejected' && (
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <XCircle className="mt-0.5 h-5 w-5 text-red-500 shrink-0" />
            <div>
              <p className="font-medium text-gray-900">Stripe necesita más información</p>
              <p className="text-sm text-gray-600 mt-1">
                Hubo un problema con la verificación de tu cuenta. Continúa en Stripe para corregirlo.
              </p>
            </div>
          </div>
          <Button onClick={handleConnect} disabled={starting} variant="outline">
            {starting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ExternalLink className="mr-2 h-4 w-4" />}
            Resolver en Stripe
          </Button>
        </div>
      )}

      {connected && (
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-500 shrink-0" />
            <div>
              <p className="font-medium text-gray-900">Stripe conectado</p>
              <p className="text-sm text-gray-600 mt-1">
                Recibes directamente en tu banco el 100% de cada reserva pagada. Las comisiones de Stripe
                se descuentan automáticamente de cada pago.
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleConnect} disabled={starting}>
              {starting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ExternalLink className="mr-2 h-4 w-4" />}
              Gestionar en Stripe
            </Button>
            <Button variant="outline" onClick={loadStatus} disabled={loading}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Actualizar estado
            </Button>
          </div>
        </div>
      )}

      {!loading && !status && (
        <p className="text-sm text-gray-500">No se pudo comprobar el estado de Stripe.</p>
      )}
    </Card>
  );
}