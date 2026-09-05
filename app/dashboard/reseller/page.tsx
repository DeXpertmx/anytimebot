'use client';

import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Save, Users, Percent } from 'lucide-react';

interface PanelData {
  reseller: { id: string; slug: string; name: string; discountPercent: number };
  wholesale: Record<string, number>;
  prices: Record<string, number>;
  customersCount: number;
}

const PLANS: Array<{ key: 'BASIC' | 'PRO' | 'TEAM'; label: string; billing: string }> = [
  { key: 'BASIC', label: 'Básico (pago único)', billing: 'una vez' },
  { key: 'PRO', label: 'Pro', billing: 'al mes' },
  { key: 'TEAM', label: 'Team', billing: 'al mes' },
];

const currency = (cents: number) => (cents / 100).toFixed(2);

export default function ResellerPanelPage() {
  const [data, setData] = useState<PanelData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/reseller/panel');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Error al cargar el panel');
      setData(json);
      const next: Record<string, string> = {};
      for (const [k, v] of Object.entries(json.prices)) next[k] = currency(v as number);
      setPrices(next);
    } catch (e: any) {
      setError(e.message || 'Error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setSaving(true);
    setSaved(false);
    setError('');
    try {
      const payload: Record<string, number> = {};
      for (const plan of PLANS) {
        const cents = Math.round(parseFloat(prices[plan.key] || '0') * 100);
        if (!Number.isFinite(cents) || cents < 0) throw new Error(`Precio inválido para ${plan.label}`);
        payload[plan.key] = cents;
      }
      const res = await fetch('/api/reseller/panel', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prices: payload }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Error al guardar');
      setSaved(true);
      await load();
      setTimeout(() => setSaved(false), 3000);
    } catch (e: any) {
      setError(e.message || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-3 py-16 text-slate-500">
        <Loader2 className="h-5 w-5 animate-spin" /> Cargando panel...
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="mx-auto max-w-2xl py-16">
        <Card>
          <CardContent className="pt-6">
            <p className="text-red-600">{error}</p>
            <Button className="mt-4" onClick={load}>Reintentar</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Panel de reseller</h1>
        <p className="mt-1 text-sm text-slate-500">
          Configura los precios que verán tus clientes. Tu enlace: <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">https://anytimebot.app/pricing?ref={data.reseller.slug}</code>
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base"><Percent className="h-4 w-4 text-indigo-600" /> Tu descuento mayorista</CardTitle>
            <CardDescription>Descuento negociado que Anytimebot te aplica sobre el precio oficial.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-slate-900">{data.reseller.discountPercent}%</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base"><Users className="h-4 w-4 text-indigo-600" /> Tus clientes</CardTitle>
            <CardDescription>Clientes atribuidos a tu enlace.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-slate-900">{data.customersCount}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Tus precios al público</CardTitle>
          <CardDescription>
            El precio mínimo es tu precio mayorista (precio oficial menos tu descuento). Nunca podrás vender por debajo de ese mínimo.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {PLANS.map((plan) => {
            const wholesale = data.wholesale[plan.key];
            return (
              <div key={plan.key} className="flex flex-wrap items-end gap-3">
                <div className="flex-1 min-w-[180px]">
                  <Label htmlFor={`price-${plan.key}`}>{plan.label}</Label>
                  <p className="text-xs text-slate-400">Tu costo: {currency(wholesale)} € {plan.billing} · mínimo {currency(wholesale)} €</p>
                </div>
                <div className="relative w-36">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">€</span>
                  <Input
                    id={`price-${plan.key}`}
                    className="pl-7"
                    inputMode="decimal"
                    value={prices[plan.key] ?? ''}
                    onChange={(e) => setPrices((p) => ({ ...p, [plan.key]: e.target.value }))}
                  />
                </div>
              </div>
            );
          })}

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex items-center gap-3 pt-2">
            <Button onClick={save} disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Guardar precios
            </Button>
            {saved && <span className="text-sm font-medium text-emerald-600">Guardado ✓</span>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}