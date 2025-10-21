
'use client';

import { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import Link from 'next/link';

export default function CancelBookingPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get('token');
  
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const handleCancel = async () => {
    if (!token) {
      setErrorMessage('Token no válido');
      setStatus('error');
      return;
    }

    setStatus('loading');

    try {
      // First verify the token
      const verifyResponse = await fetch('/api/bookings/verify-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });

      if (!verifyResponse.ok) {
        throw new Error('Token inválido o expirado');
      }

      const { bookingId } = await verifyResponse.json();

      // Now cancel the booking
      const cancelResponse = await fetch(`/api/bookings/${bookingId}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });

      if (!cancelResponse.ok) {
        const error = await cancelResponse.json();
        throw new Error(error.error || 'Error al cancelar la reserva');
      }

      setStatus('success');
    } catch (error: any) {
      console.error('Error cancelling booking:', error);
      setErrorMessage(error.message || 'Error al cancelar la reserva');
      setStatus('error');
    }
  };

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
        <Card className="max-w-md w-full p-8 text-center">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Token no válido</h1>
          <p className="text-gray-600 mb-6">
            El enlace de cancelación no es válido o ha expirado.
          </p>
          <Link href="/">
            <Button className="w-full">Ir al inicio</Button>
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <Card className="max-w-md w-full p-8">
        {status === 'idle' && (
          <div className="text-center">
            <AlertCircle className="w-16 h-16 text-yellow-500 mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Cancelar Reserva</h1>
            <p className="text-gray-600 mb-6">
              ¿Estás seguro de que deseas cancelar esta reserva? Esta acción no se puede deshacer.
            </p>
            <div className="flex gap-3">
              <Button
                onClick={handleCancel}
                variant="destructive"
                className="flex-1"
              >
                Sí, cancelar reserva
              </Button>
              <Link href="/" className="flex-1">
                <Button variant="outline" className="w-full">
                  No, volver
                </Button>
              </Link>
            </div>
          </div>
        )}

        {status === 'loading' && (
          <div className="text-center">
            <Loader2 className="w-16 h-16 text-blue-500 mx-auto mb-4 animate-spin" />
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Cancelando...</h1>
            <p className="text-gray-600">Por favor espera un momento.</p>
          </div>
        )}

        {status === 'success' && (
          <div className="text-center">
            <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-gray-900 mb-2">¡Reserva Cancelada!</h1>
            <p className="text-gray-600 mb-6">
              Tu reserva ha sido cancelada exitosamente. Recibirás un email de confirmación en breve.
            </p>
            <Link href="/">
              <Button className="w-full">Ir al inicio</Button>
            </Link>
          </div>
        )}

        {status === 'error' && (
          <div className="text-center">
            <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Error al Cancelar</h1>
            <p className="text-gray-600 mb-6">{errorMessage}</p>
            <div className="flex gap-3">
              <Button
                onClick={() => setStatus('idle')}
                variant="outline"
                className="flex-1"
              >
                Intentar de nuevo
              </Button>
              <Link href="/" className="flex-1">
                <Button className="w-full">Ir al inicio</Button>
              </Link>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
