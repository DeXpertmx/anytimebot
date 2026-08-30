'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from '@/lib/i18n/hooks';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Wallet, TrendingUp, Receipt, CalendarCheck, Download } from 'lucide-react';

interface RevenueData {
  currency: string;
  grossTotal: number;
  refundedTotal: number;
  netTotal: number;
  paidBookings: number;
  avgBooking: number;
  months: Array<{ key: string; label: string; revenue: number; bookings: number }>;
  byType: Array<{ id: string; name: string; color: string; revenue: number; bookings: number }>;
}

export function RevenueReport() {
  const { t } = useTranslation('translation');
  const [data, setData] = useState<RevenueData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const buildQuery = useCallback(
    (extra = '') => {
      const params = new URLSearchParams();
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      const qs = params.toString();
      return `${qs ? `?${qs}` : ''}${extra}`;
    },
    [from, to]
  );

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/revenue${buildQuery()}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('failed'))))
      .then((res) => setData(res.data))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [buildQuery]);

  useEffect(() => {
    load();
  }, [load]);

  const fmt = (n: number) =>
    new Intl.NumberFormat(undefined, { style: 'currency', currency: data?.currency || 'USD', maximumFractionDigits: 2 }).format(n);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-slate-500">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-indigo-600" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="py-24 text-center text-slate-500">{t('revenue.loadError')}</div>
    );
  }

  const maxRevenue = Math.max(...data.months.map((m) => m.revenue), 0.01);

  const kpis = [
    { label: t('revenue.netTotal'), value: fmt(data.netTotal), icon: Wallet, hint: `${t('revenue.gross')}: ${fmt(data.grossTotal)}` },
    { label: t('revenue.paidBookings'), value: String(data.paidBookings), icon: Receipt },
    { label: t('revenue.avgBooking'), value: fmt(data.avgBooking), icon: TrendingUp },
    { label: t('revenue.refunded'), value: fmt(data.refundedTotal), icon: CalendarCheck },
  ];

  return (
    <div className="space-y-6">
      {/* Filters */}
      <Card>
        <CardContent className="flex flex-wrap items-end gap-4 p-4">
          <div>
            <Label htmlFor="revenue-from" className="mb-1 block text-xs text-slate-500">
              {t('revenue.from')}
            </Label>
            <Input
              id="revenue-from"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="w-40"
            />
          </div>
          <div>
            <Label htmlFor="revenue-to" className="mb-1 block text-xs text-slate-500">
              {t('revenue.to')}
            </Label>
            <Input
              id="revenue-to"
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="w-40"
            />
          </div>
          <Button type="button" onClick={load}>
            {t('revenue.apply')}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setFrom('');
              setTo('');
            }}
          >
            {t('revenue.reset')}
          </Button>
          <div className="flex-1" />
          <a href={`/api/revenue/export${buildQuery()}`} download>
            <Button type="button" variant="outline">
              <Download className="h-4 w-4" />
              {t('revenue.exportCsv')}
            </Button>
          </a>
        </CardContent>
      </Card>

      {/* KPI cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((kpi) => (
          <Card key={kpi.label}>
            <CardContent className="flex items-center gap-4 p-5">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-50">
                <kpi.icon className="h-5 w-5 text-indigo-600" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm text-slate-500">{kpi.label}</p>
                <p className="text-2xl font-bold text-slate-900">{kpi.value}</p>
                {kpi.hint && <p className="truncate text-xs text-slate-400">{kpi.hint}</p>}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Monthly chart */}
      <Card>
        <CardHeader>
          <CardTitle>{t('revenue.monthlyTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex h-56 items-end gap-2">
            {data.months.map((m) => (
              <div key={m.key} className="group flex flex-1 flex-col items-center gap-1">
                <span className="text-xs font-medium text-slate-500 opacity-0 transition group-hover:opacity-100">
                  {fmt(m.revenue)}
                </span>
                <div
                  className="w-full rounded-t-md bg-indigo-500/80 transition-all group-hover:bg-indigo-600"
                  style={{ height: `${Math.max((m.revenue / maxRevenue) * 180, 2)}px` }}
                />
                <span className="text-[11px] text-slate-400">{m.label}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Per event type */}
      <Card>
        <CardHeader>
          <CardTitle>{t('revenue.byTypeTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          {data.byType.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">{t('revenue.noData')}</p>
          ) : (
            <div className="space-y-3">
              {data.byType.map((et) => (
                <div key={et.id} className="flex items-center gap-3">
                  <span className="h-3 w-3 flex-shrink-0 rounded-full" style={{ backgroundColor: et.color }} />
                  <span className="flex-1 truncate text-sm font-medium text-slate-700">{et.name}</span>
                  <span className="text-xs text-slate-400">{et.bookings}×</span>
                  <span className="w-24 text-right text-sm font-semibold text-slate-900">{fmt(et.revenue)}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
