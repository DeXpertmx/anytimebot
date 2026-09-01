'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from '@/lib/i18n/hooks';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { BadgeCheck, Users, CreditCard, RefreshCw } from 'lucide-react';

interface Membership {
  id: string;
  customerName: string;
  customerEmail: string;
  price: number;
  currency: string;
  interval: string;
  status: string;
  currentPeriodEnd: string | null;
  createdAt: string;
  eventType: { id: string; name: string } | null;
}

export function MembershipsManager() {
  const { t } = useTranslation('translation');
  const { toast } = useToast();
  const [data, setData] = useState<Membership[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch('/api/memberships')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('failed'))))
      .then((res) => setData(res.data || []))
      .catch(() => setData([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const fmt = (n: number, currency: string) =>
    new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: currency?.toUpperCase() || 'EUR',
      maximumFractionDigits: 2,
    }).format(n / 100);

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      ACTIVE: 'bg-emerald-100 text-emerald-800 border-emerald-200',
      TRIALING: 'bg-blue-100 text-blue-800 border-blue-200',
      PAST_DUE: 'bg-amber-100 text-amber-800 border-amber-200',
      CANCELLED: 'bg-slate-100 text-slate-600 border-slate-200',
    };
    return map[status] || 'bg-slate-100 text-slate-600 border-slate-200';
  };

  const statusLabel = (status: string) => {
    const key =
      status === 'ACTIVE'
        ? 'memberships.statusActive'
        : status === 'TRIALING'
          ? 'memberships.statusTrialing'
          : status === 'PAST_DUE'
            ? 'memberships.statusPastDue'
            : 'memberships.statusCancelled';
    return t(key);
  };

  const intervalLabel = (interval: string) =>
    interval === 'year' ? t('memberships.perYear') : t('memberships.perMonth');

  const cancel = async (m: Membership) => {
    if (!window.confirm(t('memberships.cancelConfirm'))) return;
    setCancelling(m.id);
    try {
      const res = await fetch(`/api/memberships/${m.id}/cancel`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'failed');
      }
      toast({ title: t('common.success'), description: t('memberships.cancelled') });
      load();
    } catch (err: any) {
      toast({
        title: t('common.error'),
        description: err?.message || t('memberships.cancelFailed'),
        variant: 'destructive',
      });
    } finally {
      setCancelling(null);
    }
  };

  const activeCount = data.filter((m) => m.status === 'ACTIVE' || m.status === 'TRIALING').length;
  const monthlyRecurring = data
    .filter((m) => m.status === 'ACTIVE' || m.status === 'TRIALING')
    .reduce((sum, m) => sum + m.price, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('memberships.title')}</h1>
          <p className="text-sm text-gray-500 mt-1">{t('memberships.description')}</p>
        </div>
        <Button variant="outline" onClick={load} disabled={loading}>
          <RefreshCw className="mr-2 h-4 w-4" />
          {t('memberships.refresh')}
        </Button>
      </div>

      {/* KPI cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-4 pt-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600">
              <BadgeCheck className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm text-slate-500">{t('memberships.activeCount')}</p>
              <p className="text-2xl font-bold text-gray-900">{activeCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 pt-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600">
              <CreditCard className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm text-slate-500">{t('memberships.mrr')}</p>
              <p className="text-2xl font-bold text-gray-900">
                {fmt(monthlyRecurring, data[0]?.currency || 'EUR')}
                <span className="text-sm font-normal text-slate-400"> / {t('memberships.month')}</span>
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 pt-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sky-100 text-sky-600">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm text-slate-500">{t('memberships.total')}</p>
              <p className="text-2xl font-bold text-gray-900">{data.length}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* List */}
      <Card>
        <CardHeader>
          <CardTitle>{t('memberships.listTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-indigo-600" />
            </div>
          ) : data.length === 0 ? (
            <div className="py-16 text-center">
              <BadgeCheck className="mx-auto h-10 w-10 text-slate-300" />
              <p className="mt-3 text-sm text-slate-500">{t('memberships.empty')}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {data.map((m) => (
                <div
                  key={m.id}
                  className="flex flex-col gap-3 rounded-lg border border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-gray-900">{m.customerName}</p>
                      <Badge className={statusBadge(m.status)}>{statusLabel(m.status)}</Badge>
                    </div>
                    <p className="mt-1 truncate text-sm text-slate-500">
                      {m.customerEmail}
                      {m.eventType ? ` · ${m.eventType.name}` : ''}
                    </p>
                    {m.currentPeriodEnd && m.status !== 'CANCELLED' && (
                      <p className="mt-0.5 text-xs text-slate-400">
                        {t('memberships.renews')}{' '}
                        {new Date(m.currentPeriodEnd).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="whitespace-nowrap font-semibold text-gray-900">
                      {fmt(m.price, m.currency)}
                      <span className="text-xs font-normal text-slate-400"> / {intervalLabel(m.interval)}</span>
                    </span>
                    {m.status === 'ACTIVE' || m.status === 'TRIALING' ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                        onClick={() => cancel(m)}
                        disabled={cancelling === m.id}
                      >
                        {cancelling === m.id ? '...' : t('memberships.cancel')}
                      </Button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}