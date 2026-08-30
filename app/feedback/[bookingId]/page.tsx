'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Loader2, Star } from 'lucide-react';

export default function FeedbackPage() {
  const params = useParams();
  const bookingId = params?.bookingId as string;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [booking, setBooking] = useState<{ guestName: string; eventTypeName: string } | null>(null);
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState('');
  const [token, setToken] = useState('');

  useEffect(() => {
    if (!bookingId) return;
    // The token is provided in the emailed link (?t=...)
    const urlToken = new URLSearchParams(window.location.search).get('t') || '';
    setToken(urlToken);
    if (!urlToken) {
      setError('Enlace inválido. Usa el enlace del email.');
      setLoading(false);
      return;
    }
    fetch(`/api/feedback/${bookingId}?t=${encodeURIComponent(urlToken)}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setBooking({
            guestName: data.data.guestName,
            eventTypeName: data.data.eventTypeName,
          });
          if (data.data.alreadySubmitted) setSubmitted(true);
        } else {
          setError('Enlace inválido o reserva no encontrada');
        }
      })
      .catch(() => setError('Enlace inválido o reserva no encontrada'))
      .finally(() => setLoading(false));
  }, [bookingId]);

  const submit = async () => {
    if (!rating) return;
    setSaving(true);
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId, token, rating, comment: comment || undefined }),
      });
      const data = await res.json();
      if (data.success) {
        setSubmitted(true);
      } else {
        setError(data.error === 'Invalid token' ? 'Enlace inválido. Usa el enlace del email.' : data.error || 'No se pudo enviar');
      }
    } catch {
      setError('No se pudo enviar. Intenta de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-lg">
        {submitted ? (
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
              <Star className="h-8 w-8 fill-emerald-600 text-emerald-600" />
            </div>
            <h1 className="text-xl font-bold text-slate-900">¡Gracias por tu opinión!</h1>
            <p className="mt-2 text-sm text-slate-500">
              Tu retroalimentación nos ayuda a mejorar.
            </p>
          </div>
        ) : (
          <>
            <div className="text-center">
              <h1 className="text-xl font-bold text-slate-900">¿Cómo fue tu experiencia?</h1>
              {booking && (
                <p className="mt-2 text-sm text-slate-500">
                  Cita: <span className="font-medium text-slate-700">{booking.eventTypeName}</span>
                </p>
              )}
            </div>

            {/* Stars */}
            <div className="mt-8 flex justify-center gap-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setRating(star)}
                  onMouseEnter={() => setHover(star)}
                  onMouseLeave={() => setHover(0)}
                  className="transition-transform hover:scale-110"
                  aria-label={`${star} estrellas`}
                >
                  <Star
                    className={`h-10 w-10 ${
                      star <= (hover || rating)
                        ? 'fill-amber-400 text-amber-400'
                        : 'text-slate-300'
                    }`}
                  />
                </button>
              ))}
            </div>
            <p className="mt-3 text-center text-sm font-medium text-slate-600">
              {rating === 0 ? 'Selecciona una calificación' : rating === 5 ? '¡Excelente!' : rating === 4 ? 'Muy bien' : rating === 3 ? 'Bien' : rating === 2 ? 'Regular' : 'Mal'}
            </p>

            {/* Comment */}
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={4}
              maxLength={2000}
              placeholder="Cuéntanos más sobre tu experiencia (opcional)..."
              className="mt-6 w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
            />

            {error && <p className="mt-3 text-center text-sm text-rose-600">{error}</p>}

            <button
              type="button"
              onClick={submit}
              disabled={!rating || saving}
              className="mt-4 w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : 'Enviar opinión'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
