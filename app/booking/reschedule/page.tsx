'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { AlertCircle, CheckCircle2, Loader2, Calendar, Clock } from 'lucide-react';
import Link from 'next/link';

interface PublicBooking {
  id: string;
  guestName: string;
  startTime: string;
  timezone: string;
  status: string;
  eventType: {
    id: string;
    name: string;
    duration: number;
    bookingPageId: string;
  };
}

export default function RescheduleBookingPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get('token');

  const [booking, setBooking] = useState<PublicBooking | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTime, setSelectedTime] = useState('');
  const [slots, setSlots] = useState<string[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!token) {
      setError('Token no válido');
      setLoading(false);
      return;
    }

    const load = async () => {
      try {
        // Verify the token and fetch the booking via the public endpoint
        const verifyRes = await fetch('/api/bookings/verify-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });
        if (!verifyRes.ok) throw new Error('Token inválido o expirado');
        const { bookingId } = await verifyRes.json();

        const bookingRes = await fetch(`/api/bookings/${bookingId}/public?token=${encodeURIComponent(token)}`);
        const bookingData = await bookingRes.json();
        if (!bookingRes.ok || !bookingData.success) {
          throw new Error(bookingData.error || 'No se pudo cargar la reserva');
        }
        setBooking(bookingData.booking);

        // Preselect tomorrow as the first available date
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        setSelectedDate(tomorrow.toISOString().split('T')[0]);
      } catch (err: any) {
        console.error('Error loading booking:', err);
        setError(err.message || 'No se pudo cargar la reserva');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [token]);

  const loadSlots = useCallback(async (date: string) => {
    if (!booking || !date) return;
    setSlotsLoading(true);
    setSelectedTime('');
    setSlots([]);
    try {
      const res = await fetch(`/api/bookings/check-availability?eventTypeId=${booking.eventType.id}&date=${date}&timezone=${encodeURIComponent(Intl.DateTimeFormat().resolvedOptions().timeZone)}`);
      const data = await res.json();
      if (data.success && Array.isArray(data.availableSlots)) {
        setSlots(data.availableSlots);
      }
    } catch {
      setSlots([]);
    } finally {
      setSlotsLoading(false);
    }
  }, [booking]);

  useEffect(() => {
    if (booking && selectedDate) loadSlots(selectedDate);
  }, [booking, selectedDate, loadSlots]);

  const handleSubmit = async () => {
    if (!booking || !selectedDate || !selectedTime) {
      setError('Selecciona una fecha y una hora válidas');
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      const startTime = new Date(`${selectedDate}T${selectedTime}:00`).toISOString();
      const res = await fetch(`/api/bookings/${booking.id}/reschedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newStartTime: startTime, token }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'No se pudo reprogramar la reserva');
      }
      setSuccess(true);
    } catch (err: any) {
      console.error('Error rescheduling booking:', err);
      setError(err.message || 'No se pudo reprogramar la reserva');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
        <Loader2 className="w-10 h-10 animate-spin text-indigo-600" />
      </div>
    );
  }

  if (!token || (error && !booking)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
        <Card className="max-w-md w-full p-8 text-center">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Enlace no válido</h1>
          <p className="text-gray-600 mb-6">{error || 'El enlace de reprogramación no es válido o ha expirado.'}</p>
          <Link href="/">
            <Button className="w-full">Ir al inicio</Button>
          </Link>
        </Card>
      </div>
    );
  }

  if (success || !booking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
        <Card className="max-w-md w-full p-8 text-center">
          <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 mb-2">¡Reserva reprogramada!</h1>
          <p className="text-gray-600 mb-6">
            Tu reserva ha sido reprogramada exitosamente. Recibirás un email con la confirmación de la nueva fecha.
          </p>
          <Link href="/">
            <Button className="w-full">Ir al inicio</Button>
          </Link>
        </Card>
      </div>
    );
  }

  const currentDate = new Date(booking.startTime).toLocaleString('es-ES', {
    dateStyle: 'full',
    timeStyle: 'short',
  });

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <Card className="max-w-lg w-full p-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Reprogramar reserva</h1>
        <p className="text-gray-600 mb-6">
          {booking.eventType.name} · {currentDate}
        </p>

        <div className="space-y-5">
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1.5 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-indigo-600" />
              Nueva fecha
            </label>
            <input
              type="date"
              value={selectedDate}
              min={new Date().toISOString().split('T')[0]}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1.5 flex items-center gap-2">
              <Clock className="w-4 h-4 text-indigo-600" />
              Nueva hora
            </label>
            {slotsLoading ? (
              <div className="flex items-center gap-2 text-sm text-gray-500 py-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Buscando horarios disponibles...
              </div>
            ) : slots.length === 0 ? (
              <p className="text-sm text-gray-500 py-2">
                No hay horarios disponibles para esta fecha. Elige otra.
              </p>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {slots.map((slot) => (
                  <button
                    key={slot}
                    type="button"
                    onClick={() => setSelectedTime(slot)}
                    className={`rounded-lg border px-2 py-2 text-sm font-medium transition ${
                      selectedTime === slot
                        ? 'border-indigo-600 bg-indigo-600 text-white'
                        : 'border-gray-200 bg-white text-gray-700 hover:border-indigo-300'
                    }`}
                  >
                    {slot}
                  </button>
                ))}
              </div>
            )}
          </div>

          {error && (
            <p className="text-sm text-red-600 flex items-center gap-2">
              <AlertCircle className="w-4 h-4" /> {error}
            </p>
          )}

          <div className="flex gap-3">
            <Button
              onClick={handleSubmit}
              disabled={submitting || !selectedDate || !selectedTime}
              className="flex-1 bg-indigo-600 hover:bg-indigo-700"
            >
              {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Confirmar nueva fecha
            </Button>
            <Link href="/" className="flex-1">
              <Button variant="outline" className="w-full">
                Cancelar
              </Button>
            </Link>
          </div>
        </div>
      </Card>
    </div>
  );
}
