'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'react-hot-toast';
import {
  Banknote,
  Ban,
  Loader2,
  Plus,
  RefreshCw,
  Download,
  ShoppingBasket,
  History,
  Vault,
  BarChart3,
  Lock,
  Unlock,
  ArrowDownToLine,
  ArrowUpFromLine,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MANUAL_PAYMENT_METHODS, paymentMethodLabel } from '@/lib/payment-methods';

// ---------------------------------------------------------------------------
// Shared types & helpers
// ---------------------------------------------------------------------------

interface OrderRow {
  id: string;
  status: string;
  currency: string;
  createdAt: string;
  note: string | null;
  createdByName: string;
  bookingId: string | null;
  items: Array<{ id: string; description: string; quantity: number; unitCents: number }>;
  payments: Array<{
    id: string;
    method: string;
    amountCents: number;
    status: string;
    refundCents: number;
    reference: string | null;
    createdByName: string;
    createdAt: string;
  }>;
  balance: { total: number; paid: number; refunded: number; net: number; due: number; state: string };
  receiptNumber: string | null;
  booking?: { id: string; guestName: string; startTime: string } | null;
  customer?: { id: string; name: string | null; email: string } | null;
}

const money = (cents: number, currency = 'EUR') =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency }).format(cents / 100);

const dateTime = (iso: string) =>
  new Date(iso).toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

const balanceBadge = (state: string) => {
  switch (state) {
    case 'PAID':
      return 'bg-emerald-100 text-emerald-700';
    case 'PARTIAL':
      return 'bg-amber-100 text-amber-700';
    case 'OVERPAID':
      return 'bg-indigo-100 text-indigo-700';
    default:
      return 'bg-slate-100 text-slate-600';
  }
};

const balanceLabel = (state: string) =>
  ({ PAID: 'Cobrada', PARTIAL: 'Parcial', OVERPAID: 'Con exceso', UNPAID: 'Pendiente' }[state] ?? state);

function eurToCents(raw: string): number | null {
  const n = Math.round(Number(raw.replace(',', '.').trim()) * 100);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

// ---------------------------------------------------------------------------
// Payments view (tabs)
// ---------------------------------------------------------------------------

type Tab = 'sale' | 'history' | 'cash' | 'reports';

export function PaymentsView() {
  const [tab, setTab] = useState<Tab>('sale');

  const tabs: Array<{ key: Tab; label: string; icon: typeof Banknote }> = [
    { key: 'sale', label: 'Venta rápida', icon: ShoppingBasket },
    { key: 'history', label: 'Historial de pagos', icon: History },
    { key: 'cash', label: 'Caja', icon: Vault },
    { key: 'reports', label: 'Reportes', icon: BarChart3 },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {tabs.map(({ key, label, icon: Icon }) => (
          <Button
            key={key}
            type="button"
            variant={tab === key ? 'default' : 'outline'}
            size="sm"
            onClick={() => setTab(key)}
          >
            <Icon className="mr-1.5 h-4 w-4" />
            {label}
          </Button>
        ))}
      </div>

      {tab === 'sale' && <QuickSaleTab />}
      {tab === 'history' && <HistoryTab />}
      {tab === 'cash' && <CashTab />}
      {tab === 'reports' && <ReportsTab />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab 1 — quick sale
// ---------------------------------------------------------------------------

function QuickSaleTab() {
  const [lines, setLines] = useState<Array<{ description: string; quantity: string; amount: string }>>([
    { description: '', quantity: '1', amount: '' },
  ]);
  const [note, setNote] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [takePayment, setTakePayment] = useState(true);
  const [method, setMethod] = useState('CASH');
  const [payAmount, setPayAmount] = useState('');
  const [saving, setSaving] = useState(false);

  const totalCents = lines.reduce((sum, l) => {
    const c = eurToCents(l.amount);
    const q = Math.max(1, Number(l.quantity) || 1);
    return sum + (c ?? 0) * q;
  }, 0);

  const updateLine = (index: number, patch: Partial<{ description: string; quantity: string; amount: string }>) =>
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));

  const submit = async () => {
    const items = lines
      .map((l) => ({
        description: l.description.trim(),
        quantity: Math.max(1, Number(l.quantity) || 1),
        unitCents: eurToCents(l.amount) ?? -1,
      }))
      .filter((l) => l.description && l.unitCents >= 0);
    if (items.length === 0) {
      toast.error('Añade al menos un concepto con importe');
      return;
    }

    const payload: any = { items, note: note || null };
    if (customerId.trim()) payload.customerId = customerId.trim();
    if (takePayment) {
      const cents = eurToCents(payAmount);
      if (cents === null || cents <= 0) {
        toast.error('Indica el importe cobrado o desmarca el cobro');
        return;
      }
      payload.payment = { method, amountCents: cents, idempotencyKey: crypto.randomUUID() };
    }

    setSaving(true);
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(`Venta registrada · ${data.data.order.receipt ? 'REC' : ''} ${money(totalCents)}`);
        setLines([{ description: '', quantity: '1', amount: '' }]);
        setPayAmount('');
        setNote('');
      } else {
        toast.error(data.error || 'No se pudo registrar la venta');
      }
    } catch {
      toast.error('Error al registrar la venta');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ShoppingBasket className="h-4 w-4" /> Venta rápida (sin cita)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {lines.map((line, index) => (
          <div key={index} className="flex flex-wrap items-end gap-2">
            <div className="min-w-[180px] flex-1">
              <Label className="mb-1 block text-xs text-slate-500">Concepto</Label>
              <Input
                value={line.description}
                onChange={(e) => updateLine(index, { description: e.target.value })}
                placeholder="Producto o servicio"
              />
            </div>
            <div className="w-20">
              <Label className="mb-1 block text-xs text-slate-500">Cant.</Label>
              <Input
                value={line.quantity}
                onChange={(e) => updateLine(index, { quantity: e.target.value })}
                inputMode="numeric"
              />
            </div>
            <div className="w-28">
              <Label className="mb-1 block text-xs text-slate-500">Precio (€)</Label>
              <Input
                value={line.amount}
                onChange={(e) => updateLine(index, { amount: e.target.value })}
                inputMode="decimal"
                placeholder="0,00"
              />
            </div>
            {lines.length > 1 && (
              <Button type="button" variant="ghost" size="icon" onClick={() => setLines(lines.filter((_, i) => i !== index))}>
                <Ban className="h-4 w-4 text-slate-400" />
              </Button>
            )}
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={() => setLines([...lines, { description: '', quantity: '1', amount: '' }])}>
          <Plus className="mr-1 h-3.5 w-3.5" /> Añadir concepto
        </Button>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label className="mb-1 block text-xs text-slate-500">Cliente del CRM (opcional)</Label>
            <Input value={customerId} onChange={(e) => setCustomerId(e.target.value)} placeholder="ID del cliente" />
          </div>
          <div>
            <Label className="mb-1 block text-xs text-slate-500">Nota (opcional)</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Referencia, detalle…" />
          </div>
        </div>

        <div className="rounded-lg border bg-slate-50 p-3">
          <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <input type="checkbox" checked={takePayment} onChange={(e) => setTakePayment(e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
            Cobrar ahora
          </label>
          {takePayment && (
            <div className="mt-3 flex flex-wrap items-end gap-2">
              <div>
                <Label className="mb-1 block text-xs text-slate-500">Método</Label>
                <select value={method} onChange={(e) => setMethod(e.target.value)} className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm">
                  {MANUAL_PAYMENT_METHODS.map((m) => (
                    <option key={m} value={m}>{paymentMethodLabel(m)}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label className="mb-1 block text-xs text-slate-500">Importe (€)</Label>
                <Input value={payAmount} onChange={(e) => setPayAmount(e.target.value)} inputMode="decimal" placeholder="0,00" className="w-28" />
              </div>
              <p className="pb-2 text-xs text-slate-500">
                Déjalo menor que el total para un pago parcial; podrás añadir el resto después.
              </p>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t pt-4">
          <p className="text-sm text-slate-500">Total</p>
          <p className="text-xl font-semibold">{money(totalCents)}</p>
        </div>
        <Button type="button" className="w-full bg-emerald-600 text-white hover:bg-emerald-700" disabled={saving} onClick={submit}>
          {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Banknote className="mr-1.5 h-4 w-4" />}
          Registrar venta
        </Button>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Tab 2 — payments history
// ---------------------------------------------------------------------------

function HistoryTab() {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showVoided, setShowVoided] = useState(false);
  const [payingOrder, setPayingOrder] = useState<OrderRow | null>(null);
  const [payMethod, setPayMethod] = useState('CASH');
  const [payAmount, setPayAmount] = useState('');
  const [paySaving, setPaySaving] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    fetch('/api/orders?pageSize=100')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('failed'))))
      .then((res) => setOrders(res.data ?? []))
      .catch(() => toast.error('No se pudo cargar el historial'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const visible = useMemo(() => orders.filter((o) => showVoided || o.status === 'ISSUED'), [orders, showVoided]);

  const addPayment = async () => {
    if (!payingOrder) return;
    const cents = eurToCents(payAmount);
    if (cents === null || cents <= 0) {
      toast.error('Importe no válido');
      return;
    }
    setPaySaving(true);
    try {
      const res = await fetch(`/api/orders/${payingOrder.id}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method: payMethod, amountCents: cents, idempotencyKey: crypto.randomUUID() }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Pago registrado');
        setPayingOrder(null);
        setPayAmount('');
        load();
      } else {
        toast.error(data.error || 'No se pudo registrar el pago');
      }
    } catch {
      toast.error('Error al registrar el pago');
    } finally {
      setPaySaving(false);
    }
  };

  const annulPayment = async (orderId: string, paymentId: string) => {
    const reason = window.prompt('Motivo de la anulación:');
    if (!reason) return;
    setBusyId(paymentId);
    try {
      const res = await fetch(`/api/payments/${paymentId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'annul', reason }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Pago anulado');
        load();
      } else {
        toast.error(data.error || 'No se pudo anular');
      }
    } catch {
      toast.error('Error al anular el pago');
    } finally {
      setBusyId(null);
    }
  };

  const refundPayment = async (orderId: string, paymentId: string, maxCents: number) => {
    const raw = window.prompt(`Importe a reembolsar en euros (máximo ${(maxCents / 100).toFixed(2)}):`, (maxCents / 100).toFixed(2));
    if (!raw) return;
    const cents = eurToCents(raw);
    if (cents === null || cents <= 0 || cents > maxCents) {
      toast.error('Importe de reembolso no válido');
      return;
    }
    const reason = window.prompt('Motivo del reembolso:');
    if (!reason) return;
    setBusyId(paymentId);
    try {
      const res = await fetch(`/api/payments/${paymentId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'refund', amountCents: cents, reason }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Reembolso registrado');
        load();
      } else {
        toast.error(data.error || 'No se pudo reembolsar');
      }
    } catch {
      toast.error('Error al reembolsar');
    } finally {
      setBusyId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-24 text-slate-500">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <label className="flex items-center gap-2 text-sm text-slate-600">
        <input type="checkbox" checked={showVoided} onChange={(e) => setShowVoided(e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
        Mostrar ventas anuladas
      </label>

      {visible.length === 0 && <p className="py-16 text-center text-sm text-slate-500">Todavía no hay ventas registradas.</p>}

      {visible.map((order) => (
        <Card key={order.id}>
          <CardContent className="p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-medium text-slate-800">
                  {order.receiptNumber ?? order.id.slice(-8)}
                  {order.booking ? <span className="ml-2 text-xs text-slate-500">· cita de {order.booking.guestName}</span> : null}
                  {order.customer ? <span className="ml-2 text-xs text-slate-500">· {order.customer.name || order.customer.email}</span> : null}
                </p>
                <p className="text-xs text-slate-500">
                  {dateTime(order.createdAt)} · registró {order.createdByName}
                </p>
              </div>
              <div className="text-right">
                <p className="font-semibold">{money(order.balance.total, order.currency)}</p>
                <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${balanceBadge(order.balance.state)}`}>
                  {balanceLabel(order.balance.state)}
                  {order.balance.state === 'PARTIAL' ? ` · falta ${money(order.balance.due, order.currency)}` : ''}
                </span>
              </div>
            </div>

            <ul className="mt-3 space-y-1 text-sm">
              {order.items.map((item) => (
                <li key={item.id} className="flex justify-between text-slate-600">
                  <span>
                    {item.quantity} × {item.description}
                  </span>
                  <span>{money(item.quantity * item.unitCents, order.currency)}</span>
                </li>
              ))}
            </ul>

            {order.payments.length > 0 && (
              <div className="mt-3 rounded-lg border bg-slate-50 p-2 text-sm">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Pagos</p>
                {order.payments.map((p) => (
                  <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-0.5">
                    <span className="flex items-center gap-2">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${p.status === 'COMPLETED' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                        {p.status === 'COMPLETED' ? 'Cobrado' : 'Anulado'}
                      </span>
                      {paymentMethodLabel(p.method)}
                      <span className="text-slate-500">{dateTime(p.createdAt)}</span>
                      {p.reference ? <span className="text-xs text-slate-400">ref. {p.reference}</span> : null}
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="font-medium">{money(p.amountCents, order.currency)}</span>
                      {p.refundCents > 0 && <span className="text-xs text-rose-600">−{money(p.refundCents, order.currency)} reembolsado</span>}
                      {p.status === 'COMPLETED' && (
                        <>
                          <Button type="button" variant="ghost" size="sm" disabled={busyId === p.id} onClick={() => refundPayment(order.id, p.id, p.amountCents - p.refundCents)}>
                            <RefreshCw className="mr-1 h-3 w-3" /> Reembolsar
                          </Button>
                          <Button type="button" variant="ghost" size="sm" disabled={busyId === p.id} onClick={() => annulPayment(order.id, p.id)}>
                            <Ban className="mr-1 h-3 w-3" /> Anular
                          </Button>
                        </>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {order.status === 'ISSUED' && order.balance.due > 0 && (
              <Button
                type="button"
                size="sm"
                className="mt-3 bg-emerald-600 text-white hover:bg-emerald-700"
                onClick={() => {
                  setPayingOrder(order);
                  setPayAmount((order.balance.due / 100).toFixed(2));
                }}
              >
                <Plus className="mr-1 h-3.5 w-3.5" /> Añadir pago
              </Button>
            )}
          </CardContent>
        </Card>
      ))}

      {payingOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setPayingOrder(null)}>
          <Card className="w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <CardHeader>
              <CardTitle className="text-base">Añadir pago · {money(payingOrder.balance.due, payingOrder.currency)} pendiente</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label className="mb-1 block text-xs text-slate-500">Método</Label>
                <select value={payMethod} onChange={(e) => setPayMethod(e.target.value)} className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm">
                  {MANUAL_PAYMENT_METHODS.map((m) => (
                    <option key={m} value={m}>{paymentMethodLabel(m)}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label className="mb-1 block text-xs text-slate-500">Importe (€)</Label>
                <Input value={payAmount} onChange={(e) => setPayAmount(e.target.value)} inputMode="decimal" />
              </div>
              <Button type="button" className="w-full bg-emerald-600 text-white hover:bg-emerald-700" disabled={paySaving} onClick={addPayment}>
                {paySaving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Banknote className="mr-1.5 h-4 w-4" />}
                Registrar pago
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab 3 — cash drawer
// ---------------------------------------------------------------------------

interface CashSessionData {
  current: null | {
    id: string;
    openingCents: number;
    openedAt: string;
    openedBy: string;
    location?: { id: string; name: string } | null;
    flow: { cashInCents: number; cashOutCents: number; expectedCents: number };
    movements: Array<{ id: string; direction: string; type: string; amountCents: number; concept: string; createdAt: string }>;
  };
  history: Array<{
    id: string;
    openingCents: number;
    expectedCents: number | null;
    countedCents: number | null;
    differenceCents: number | null;
    openedAt: string;
    closedAt: string | null;
    location?: { id: string; name: string } | null;
  }>;
}

function CashTab() {
  const [data, setData] = useState<CashSessionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState(false);
  const [openingFloat, setOpeningFloat] = useState('');
  const [closing, setClosing] = useState(false);
  const [counted, setCounted] = useState('');
  const [movType, setMovType] = useState('DEPOSIT');
  const [movDirection, setMovDirection] = useState('IN');
  const [movAmount, setMovAmount] = useState('');
  const [movConcept, setMovConcept] = useState('');
  const [movSaving, setMovSaving] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    fetch('/api/cash-sessions')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('failed'))))
      .then((res) => setData(res.data))
      .catch(() => toast.error('No se pudo cargar la caja'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openDrawer = async () => {
    const cents = eurToCents(openingFloat || '0');
    if (cents === null) {
      toast.error('Fondo inicial no válido');
      return;
    }
    setOpening(true);
    try {
      const res = await fetch('/api/cash-sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ openingCents: cents }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success('Caja abierta');
        setOpeningFloat('');
        load();
      } else {
        toast.error(json.error || 'No se pudo abrir la caja');
      }
    } catch {
      toast.error('Error al abrir la caja');
    } finally {
      setOpening(false);
    }
  };

  const closeDrawer = async () => {
    const cents = eurToCents(counted);
    if (cents === null) {
      toast.error('Recuento no válido');
      return;
    }
    setClosing(true);
    try {
      const res = await fetch(`/api/cash-sessions/${data!.current!.id}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ countedCents: cents }),
      });
      const json = await res.json();
      if (json.success) {
        const s = json.data.summary;
        toast.success(
          `Cierre: esperado ${money(s.expectedCents)} · contado ${money(s.countedCents)} · diferencia ${money(s.differenceCents)}`
        );
        setCounted('');
        load();
      } else {
        toast.error(json.error || 'No se pudo cerrar la caja');
      }
    } catch {
      toast.error('Error al cerrar la caja');
    } finally {
      setClosing(false);
    }
  };

  const addMovement = async () => {
    const cents = eurToCents(movAmount);
    if (cents === null || cents <= 0 || !movConcept.trim()) {
      toast.error('Rellena importe y concepto');
      return;
    }
    setMovSaving(true);
    try {
      const res = await fetch(`/api/cash-sessions/${data!.current!.id}/movements`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: movType, direction: movDirection, amountCents: cents, concept: movConcept }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success('Movimiento registrado');
        setMovAmount('');
        setMovConcept('');
        load();
      } else {
        toast.error(json.error || 'No se pudo registrar el movimiento');
      }
    } catch {
      toast.error('Error al registrar el movimiento');
    } finally {
      setMovSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-24 text-slate-500">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  const current = data?.current ?? null;

  return (
    <div className="space-y-4">
      {!current ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Unlock className="h-4 w-4" /> Abrir caja
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-end gap-3">
            <div>
              <Label className="mb-1 block text-xs text-slate-500">Fondo inicial (€)</Label>
              <Input value={openingFloat} onChange={(e) => setOpeningFloat(e.target.value)} inputMode="decimal" placeholder="0,00" className="w-32" />
            </div>
            <Button type="button" className="bg-emerald-600 text-white hover:bg-emerald-700" disabled={opening} onClick={openDrawer}>
              {opening ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Vault className="mr-1.5 h-4 w-4" />}
              Abrir turno
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between text-base">
                <span className="flex items-center gap-2">
                  <Lock className="h-4 w-4 text-emerald-600" /> Caja abierta · {dateTime(current.openedAt)}
                </span>
                <span className="text-sm font-normal text-slate-500">
                  Fondo {money(current.openingCents)}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg border bg-slate-50 p-3">
                  <p className="text-xs text-slate-500">Entradas en efectivo</p>
                  <p className="text-lg font-semibold text-emerald-700">{money(current.flow.cashInCents)}</p>
                </div>
                <div className="rounded-lg border bg-slate-50 p-3">
                  <p className="text-xs text-slate-500">Salidas</p>
                  <p className="text-lg font-semibold text-rose-600">{money(current.flow.cashOutCents)}</p>
                </div>
                <div className="rounded-lg border bg-emerald-50 p-3">
                  <p className="text-xs text-slate-500">Esperado en cajón</p>
                  <p className="text-lg font-semibold">{money(current.flow.expectedCents)}</p>
                </div>
              </div>

              {current.movements.length > 0 && (
                <ul className="max-h-56 space-y-1 overflow-y-auto rounded-lg border p-2 text-sm">
                  {current.movements.map((m) => (
                    <li key={m.id} className="flex items-center justify-between gap-2">
                      <span className="text-slate-600">
                        <span className={`mr-2 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${m.direction === 'IN' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                          {m.direction === 'IN' ? 'ENTRADA' : 'SALIDA'}
                        </span>
                        {m.concept}
                        <span className="ml-2 text-xs text-slate-400">{dateTime(m.createdAt)}</span>
                      </span>
                      <span className="font-medium">{money(m.amountCents)}</span>
                    </li>
                  ))}
                </ul>
              )}

              <div className="rounded-lg border p-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Movimiento manual</p>
                <div className="flex flex-wrap items-end gap-2">
                  <select value={movType} onChange={(e) => setMovType(e.target.value)} className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm">
                    <option value="DEPOSIT">Ingreso (no venta)</option>
                    <option value="WITHDRAWAL">Retiro</option>
                    <option value="ADJUSTMENT">Ajuste</option>
                  </select>
                  <select value={movDirection} onChange={(e) => setMovDirection(e.target.value)} className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm">
                    <option value="IN">Entra dinero</option>
                    <option value="OUT">Sale dinero</option>
                  </select>
                  <Input value={movAmount} onChange={(e) => setMovAmount(e.target.value)} inputMode="decimal" placeholder="0,00" className="w-24" />
                  <Input value={movConcept} onChange={(e) => setMovConcept(e.target.value)} placeholder="Concepto" className="min-w-[160px] flex-1" />
                  <Button type="button" variant="outline" size="sm" disabled={movSaving} onClick={addMovement}>
                    {movSaving ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : movDirection === 'IN' ? <ArrowDownToLine className="mr-1 h-3.5 w-3.5" /> : <ArrowUpFromLine className="mr-1 h-3.5 w-3.5" />}
                    Registrar
                  </Button>
                </div>
              </div>

              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-700">Cierre de caja (arqueo)</p>
                <div className="flex flex-wrap items-end gap-2">
                  <div>
                    <Label className="mb-1 block text-xs text-amber-700">Dinero contado (€)</Label>
                    <Input value={counted} onChange={(e) => setCounted(e.target.value)} inputMode="decimal" placeholder="0,00" className="w-32" />
                  </div>
                  <Button type="button" className="bg-amber-600 text-white hover:bg-amber-700" disabled={closing} onClick={closeDrawer}>
                    {closing ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Lock className="mr-1.5 h-4 w-4" />}
                    Cerrar turno
                  </Button>
                </div>
                <p className="mt-2 text-xs text-amber-700">
                  Al cerrar se congela el período: los cobros siguientes entrarán en el próximo turno.
                </p>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {data && data.history.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Turnos cerrados</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {data.history.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-2">
                  <span>
                    {dateTime(s.openedAt)} → {s.closedAt ? dateTime(s.closedAt) : '—'}
                    {s.location ? <span className="ml-2 text-xs text-slate-500">{s.location.name}</span> : null}
                  </span>
                  <span className="flex items-center gap-3">
                    <span className="text-slate-500">Esperado {money(s.expectedCents ?? 0)}</span>
                    <span className="text-slate-500">Contado {money(s.countedCents ?? 0)}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${(s.differenceCents ?? 0) === 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                      dif. {money(s.differenceCents ?? 0)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab 4 — reports
// ---------------------------------------------------------------------------

function ReportsTab() {
  const [groupBy, setGroupBy] = useState<'method' | 'staff' | 'location' | 'day'>('method');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const query = useCallback(() => {
    const params = new URLSearchParams({ groupBy });
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    return params.toString();
  }, [groupBy, from, to]);

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/reports/payments?${query()}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('failed'))))
      .then((res) => setData(res.data))
      .catch(() => toast.error('No se pudo cargar el reporte'))
      .finally(() => setLoading(false));
  }, [query]);

  useEffect(() => {
    load();
  }, [load]);

  const groupLabels: Record<string, string> = {
    method: 'Método de pago',
    staff: 'Empleado',
    location: 'Sucursal',
    day: 'Día',
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 p-4">
          <div>
            <Label className="mb-1 block text-xs text-slate-500">Agrupar por</Label>
            <select value={groupBy} onChange={(e) => setGroupBy(e.target.value as any)} className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm">
              {Object.entries(groupLabels).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <div>
            <Label className="mb-1 block text-xs text-slate-500">Desde</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
          </div>
          <div>
            <Label className="mb-1 block text-xs text-slate-500">Hasta</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
          </div>
          <Button type="button" onClick={load}>Aplicar</Button>
          <Button type="button" variant="outline" onClick={() => window.open(`/api/reports/payments?${query()}&format=csv`, '_blank')}>
            <Download className="mr-1.5 h-4 w-4" /> CSV
          </Button>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex justify-center py-24 text-slate-500">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      ) : (
        data && (
          <>
            <div className="grid gap-3 sm:grid-cols-4">
              <Card><CardContent className="p-4">
                <p className="text-xs text-slate-500">Bruto</p>
                <p className="text-lg font-semibold">{money(data.totals.grossCents, data.currency)}</p>
              </CardContent></Card>
              <Card><CardContent className="p-4">
                <p className="text-xs text-slate-500">Reembolsos</p>
                <p className="text-lg font-semibold text-rose-600">{money(data.totals.refundCents, data.currency)}</p>
              </CardContent></Card>
              <Card><CardContent className="p-4">
                <p className="text-xs text-slate-500">Neto</p>
                <p className="text-lg font-semibold text-emerald-700">{money(data.totals.netCents, data.currency)}</p>
              </CardContent></Card>
              <Card><CardContent className="p-4">
                <p className="text-xs text-slate-500">Operaciones</p>
                <p className="text-lg font-semibold">{data.totals.count}</p>
              </CardContent></Card>
            </div>

            <Card>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs uppercase tracking-wide text-slate-400">
                      <th className="px-4 py-2">{groupLabels[data.groupBy]}</th>
                      <th className="px-4 py-2 text-right">Bruto</th>
                      <th className="px-4 py-2 text-right">Reembolsos</th>
                      <th className="px-4 py-2 text-right">Neto</th>
                      <th className="px-4 py-2 text-right">Ops.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.map((row: any) => (
                      <tr key={row.key} className="border-b last:border-0">
                        <td className="px-4 py-2 font-medium text-slate-700">{row.label}</td>
                        <td className="px-4 py-2 text-right">{money(row.grossCents, data.currency)}</td>
                        <td className="px-4 py-2 text-right text-rose-600">{row.refundCents ? money(row.refundCents, data.currency) : '—'}</td>
                        <td className="px-4 py-2 text-right font-semibold">{money(row.netCents, data.currency)}</td>
                        <td className="px-4 py-2 text-right text-slate-500">{row.count}</td>
                      </tr>
                    ))}
                    {data.rows.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-4 py-8 text-center text-slate-500">Sin pagos en el período.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </>
        )
      )}
    </div>
  );
}
