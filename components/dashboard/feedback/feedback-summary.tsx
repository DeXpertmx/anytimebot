'use client';

import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Star, MessageSquareQuote } from 'lucide-react';

interface FeedbackItem {
  id: string;
  rating: number;
  comment?: string | null;
  createdAt: string;
  guestName: string;
  eventTypeName: string;
  startTime: string;
}

interface FeedbackData {
  summary: { total: number; average: number; distribution: number[] };
  feedbacks: FeedbackItem[];
}

export function FeedbackSummary() {
  const [data, setData] = useState<FeedbackData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/feedback');
      const json = await res.json();
      if (json.success) setData(json.data);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const stars = (rating: number) =>
    Array.from({ length: 5 }, (_, i) => (
      <Star
        key={i}
        className={`h-3.5 w-3.5 ${i < rating ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}`}
      />
    ));

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Cargando opiniones...
      </div>
    );
  }

  const total = data?.summary.total || 0;
  const average = data?.summary.average || 0;
  const distribution = data?.summary.distribution || [0, 0, 0, 0, 0];

  return (
    <div className="space-y-4">
      {/* Summary card */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <div className="text-4xl font-bold text-slate-900">{average || '—'}</div>
            <div>
              <div className="flex">{average ? stars(Math.round(average)) : stars(0)}</div>
              <p className="mt-1 text-sm text-slate-500">
                {total} {total === 1 ? 'opinión' : 'opiniones'} recibidas
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-1.5 p-5">
            {[5, 4, 3, 2, 1].map((star) => {
              const count = distribution[star - 1] || 0;
              const pct = total > 0 ? Math.round((count / total) * 100) : 0;
              return (
                <div key={star} className="flex items-center gap-2 text-xs">
                  <span className="w-3 text-slate-600">{star}</span>
                  <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-amber-400" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="w-8 text-right text-slate-500">{count}</span>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      {/* Feedback list */}
      {total === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <MessageSquareQuote className="mb-4 h-16 w-16 text-slate-300" />
            <h3 className="mb-2 text-lg font-medium text-slate-900">Aún no hay opiniones</h3>
            <p className="max-w-sm text-center text-slate-500">
              Tus clientes recibirán una encuesta por email 2 horas después de cada cita.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {data!.feedbacks.map((item) => (
            <Card key={item.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="flex">{stars(item.rating)}</div>
                      <span className="font-medium text-slate-900">{item.guestName}</span>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {item.eventTypeName} ·{' '}
                      {new Date(item.startTime).toLocaleDateString('es-ES', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </p>
                    {item.comment && (
                      <p className="mt-2 rounded-md bg-slate-50 p-3 text-sm text-slate-700">
                        “{item.comment}”
                      </p>
                    )}
                  </div>
                  <span className="shrink-0 text-xs text-slate-400">
                    {new Date(item.createdAt).toLocaleDateString('es-ES', {
                      day: 'numeric',
                      month: 'short',
                    })}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Button variant="outline" size="sm" onClick={load}>
        Actualizar
      </Button>
    </div>
  );
}
