'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from '@/lib/i18n/hooks';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { FileText, ExternalLink, Receipt, X } from 'lucide-react';

interface InvoiceItem {
  name?: string;
  description?: string | null;
  quantity?: number;
  unitPriceCents?: number;
  totalCents?: number;
  durationMinutes?: number;
}

interface InvoiceData {
  id: string;
  number: string;
  status: 'ISSUED' | 'CANCELLED';
  issueDate: string;
  serviceDate: string;
  currency: string;
  totalAmount: number;
  vatRate: number;
  vatAmount: number;
  items: InvoiceItem[];
  issuerName: string | null;
  issuerCompany: string | null;
  issuerAddress: string | null;
  issuerCountry: string | null;
  issuerEmail: string | null;
  guestName: string;
  guestEmail: string;
  booking: { id: string; status: string; startTime: string } | null;
}

export function InvoicesView() {
  const { t } = useTranslation('translation');
  const [data, setData] = useState<InvoiceData[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [selected, setSelected] = useState<InvoiceData | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch('/api/invoices')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('failed'))))
      .then((res) => setData(res.data))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const fmt = (cents: number, currency: string) =>
    new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: currency || 'EUR',
      maximumFractionDigits: 2,
    }).format((cents || 0) / 100);

  const fmtDate = (value: string) => {
    const d = new Date(value);
    return isNaN(d.getTime())
      ? ''
      : d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const serviceNames = (inv: InvoiceData) =>
    (inv.items || [])
      .map((i) => i.name || t('invoices.service'))
      .filter(Boolean)
      .join(' + ');

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-slate-500">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-indigo-600" />
      </div>
    );
  }

  if (error || !data) {
    return <div className="py-24 text-center text-slate-500">{t('invoices.loadError')}</div>;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-50">
              <Receipt className="h-5 w-5 text-indigo-600" />
            </div>
            <div>
              <CardTitle className="text-lg">{t('invoices.title')}</CardTitle>
              <CardDescription>{t('invoices.description')}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {data.length === 0 ? (
            <div className="py-10 text-center">
              <FileText className="mx-auto h-10 w-10 text-slate-300" />
              <p className="mt-3 text-sm font-medium text-slate-600">{t('invoices.empty')}</p>
              <p className="mt-1 text-sm text-slate-400">{t('invoices.emptyHint')}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-slate-400">
                    <th className="py-2 pr-4 font-semibold">{t('invoices.number')}</th>
                    <th className="py-2 pr-4 font-semibold">{t('invoices.customer')}</th>
                    <th className="py-2 pr-4 font-semibold">{t('invoices.service')}</th>
                    <th className="py-2 pr-4 font-semibold">{t('invoices.serviceDate')}</th>
                    <th className="py-2 pr-4 text-right font-semibold">{t('invoices.total')}</th>
                    <th className="py-2 pr-4 font-semibold">{t('invoices.status')}</th>
                    <th className="py-2 text-right font-semibold">{t('invoices.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((inv) => (
                    <tr key={inv.id} className="border-b last:border-0 hover:bg-slate-50/60">
                      <td className="py-3 pr-4 font-semibold text-indigo-600">{inv.number}</td>
                      <td className="py-3 pr-4 text-slate-700">
                        <div className="truncate font-medium">{inv.guestName}</div>
                        <div className="truncate text-xs text-slate-400">{inv.guestEmail}</div>
                      </td>
                      <td className="max-w-[220px] py-3 pr-4">
                        <span className="line-clamp-1 text-slate-600">{serviceNames(inv)}</span>
                      </td>
                      <td className="whitespace-nowrap py-3 pr-4 text-slate-500">
                        {fmtDate(inv.serviceDate)}
                      </td>
                      <td className="whitespace-nowrap py-3 pr-4 text-right font-semibold text-slate-900">
                        {fmt(inv.totalAmount, inv.currency)}
                      </td>
                      <td className="py-3 pr-4">
                        {inv.status === 'CANCELLED' ? (
                          <Badge variant="destructive" className="bg-red-50 text-red-600">
                            {t('invoices.cancelled')}
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="bg-emerald-50 text-emerald-600">
                            {t('invoices.issued')}
                          </Badge>
                        )}
                      </td>
                      <td className="whitespace-nowrap py-3 text-right">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setSelected(inv)}
                        >
                          {t('invoices.view')}
                        </Button>
                        <a
                          href={`/api/invoices/${inv.id}/download`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="ml-2"
                          title={t('invoices.openPdf')}
                        >
                          <Button type="button" variant="ghost" size="sm">
                            <ExternalLink className="h-4 w-4" />
                            <span className="ml-1">{t('invoices.pdf')}</span>
                          </Button>
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detail dialog */}
      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-w-2xl">
          {selected && (
            <>
              <DialogHeader>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <DialogTitle className="flex items-center gap-2 text-indigo-600">
                      {selected.number}
                    </DialogTitle>
                    <DialogDescription>
                      {fmtDate(selected.serviceDate)}
                    </DialogDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    {selected.status === 'CANCELLED' ? (
                      <Badge variant="destructive" className="bg-red-50 text-red-600">
                        {t('invoices.cancelled')}
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="bg-emerald-50 text-emerald-600">
                        {t('invoices.issued')}
                      </Badge>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => setSelected(null)}
                      aria-label="Cerrar"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </DialogHeader>

              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                    {t('invoices.issuer')}
                  </p>
                  <p className="mt-1 text-sm font-medium text-slate-800">
                    {selected.issuerCompany || selected.issuerName || '—'}
                  </p>
                  <p className="text-sm text-slate-500">{selected.issuerAddress || ''}</p>
                  <p className="text-sm text-slate-500">{selected.issuerEmail || ''}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                    {t('invoices.guest')}
                  </p>
                  <p className="mt-1 text-sm font-medium text-slate-800">{selected.guestName}</p>
                  <p className="text-sm text-slate-500">{selected.guestEmail}</p>
                </div>
              </div>

              <div className="overflow-hidden rounded-lg border">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400">
                    <tr>
                      <th className="px-3 py-2 font-semibold">{t('invoices.service')}</th>
                      <th className="px-3 py-2 text-right font-semibold">{t('invoices.total')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(selected.items || []).map((item, idx) => (
                      <tr key={idx} className="border-t">
                        <td className="px-3 py-2 text-slate-700">
                          {item.name}
                          {item.description ? (
                            <div className="text-xs text-slate-400">{item.description}</div>
                          ) : null}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-right font-medium text-slate-800">
                          {fmt(item.totalCents ?? item.unitPriceCents ?? 0, selected.currency)}
                        </td>
                      </tr>
                    ))}
                    {selected.status === 'CANCELLED' ? (
                      <tr className="border-t bg-red-50/40">
                        <td className="px-3 py-2 text-sm text-red-600">
                          {t('invoices.refundedNote')}
                        </td>
                        <td className="px-3 py-2 text-right text-sm font-semibold text-red-600">
                          {t('invoices.cancelled')}
                        </td>
                      </tr>
                    ) : null}
                    <tr className="border-t bg-slate-50/60">
                      <td className="px-3 py-2 text-right text-sm font-semibold text-slate-700">
                        {t('invoices.total')}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right text-base font-bold text-slate-900">
                        {fmt(selected.totalAmount, selected.currency)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="flex justify-end">
                <a
                  href={`/api/invoices/${selected.id}/download`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Button type="button">
                    <ExternalLink className="h-4 w-4" />
                    <span className="ml-2">{t('invoices.openPdf')}</span>
                  </Button>
                </a>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
