'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Plus, Store } from 'lucide-react';

interface PlanPricing {
  public: number;
  wholesale: number;
}

interface ResellerRow {
  id: string;
  name: string;
  slug: string;
  contactEmail: string | null;
  discountPercent: number;
  isActive: boolean;
  ownerEmail: string | null;
  customersCount: number;
  paidCustomersCount: number;
  estimatedRevenueCents: number;
  estimatedMarginCents: number;
  plans: Record<string, PlanPricing>;
}

const currency = (cents: number) => (cents / 100).toFixed(2);

export default function AdminResellersPage() {
  const [resellers, setResellers] = useState<ResellerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', slug: '', contactEmail: '', discountPercent: '0', ownerEmail: '' });
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<{ id: string; discountPercent: number; isActive: boolean } | null>(null);
  const [notice, setNotice] = useState('');
  const [linking, setLinking] = useState<{ id: string; email: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/admin/resellers');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Error al cargar resellers');
      setResellers(json);
    } catch (e: any) {
      setError(e.message || 'Error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const create = async () => {
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const res = await fetch('/api/admin/resellers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          slug: form.slug,
          contactEmail: form.contactEmail,
          discountPercent: parseInt(form.discountPercent || '0', 10) || 0,
          ownerEmail: form.ownerEmail,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Error al crear');
      setShowCreate(false);
      setForm({ name: '', slug: '', contactEmail: '', discountPercent: '0', ownerEmail: '' });
      if (json.warning) setNotice(json.warning);
      await load();
    } catch (e: any) {
      setError(e.message || 'Error');
    } finally {
      setSaving(false);
    }
  };

  const linkOwner = async () => {
    if (!linking) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const res = await fetch(`/api/admin/resellers/${linking.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ownerEmail: linking.email }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Error al vincular');
      setLinking(null);
      await load();
    } catch (e: any) {
      setError(e.message || 'Error');
    } finally {
      setSaving(false);
    }
  };

  const saveEdit = async () => {
    if (!editing) return;
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/admin/resellers/${editing.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ discountPercent: editing.discountPercent, isActive: editing.isActive }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Error al guardar');
      setEditing(null);
      await load();
    } catch (e: any) {
      setError(e.message || 'Error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Resellers</h1>
          <p className="mt-1 text-sm text-slate-500">
            Partners que venden Anytimebot con su propio precio. El descuento es lo que Anytimebot les cede; ellos fijan el precio público en su panel.
          </p>
        </div>
        <Button onClick={() => setShowCreate((v) => !v)}>
          <Plus className="mr-2 h-4 w-4" /> Nuevo reseller
        </Button>
      </div>

      {showCreate && (
        <Card>
          <CardContent className="pt-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              <div>
                <Label htmlFor="r-name">Nombre</Label>
                <Input id="r-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="ACME Agency" />
              </div>
              <div>
                <Label htmlFor="r-slug">Slug (enlace)</Label>
                <Input id="r-slug" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="acme" />
              </div>
              <div>
                <Label htmlFor="r-email">Email de contacto</Label>
                <Input id="r-email" value={form.contactEmail} onChange={(e) => setForm({ ...form, contactEmail: e.target.value })} placeholder="ventas@acme.com" />
              </div>
              <div>
                <Label htmlFor="r-discount">Descuento mayorista %</Label>
                <Input id="r-discount" type="number" min={0} max={100} value={form.discountPercent} onChange={(e) => setForm({ ...form, discountPercent: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="r-owner">Email de la cuenta del reseller</Label>
                <Input id="r-owner" value={form.ownerEmail} onChange={(e) => setForm({ ...form, ownerEmail: e.target.value })} placeholder="panel@acme.com" />
                <p className="mt-1 text-xs text-slate-500">Debe ser el email con el que esa persona ya se registró en Anytimebot. Si aún no tiene cuenta, déjalo vacío y vincúlala después.</p>
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <Button onClick={create} disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Crear
              </Button>
              <Button variant="outline" onClick={() => setShowCreate(false)}>Cancelar</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
      {notice && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">{notice}</p>}

      {loading ? (
        <div className="flex items-center gap-3 py-12 text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin" /> Cargando...
        </div>
      ) : resellers.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-slate-500">
            <Store className="h-8 w-8" />
            <p>No hay resellers todavía. Crea el primero con el botón superior.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {resellers.map((r) => (
            <Card key={r.id}>
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <CardTitle className="text-base">{r.name}</CardTitle>
                    <Badge variant={r.isActive ? 'default' : 'secondary'}>{r.isActive ? 'Activo' : 'Inactivo'}</Badge>
                    {r.ownerEmail ? <Badge variant="outline">{r.ownerEmail}</Badge> : <Badge variant="destructive">Sin cuenta vinculada</Badge>}
                  </div>
                  <code className="rounded bg-slate-100 px-2 py-1 text-xs">?ref={r.slug}</code>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="rounded-lg bg-slate-50 p-3">
                    <p className="text-xs text-slate-500">Descuento</p>
                    <p className="text-lg font-bold text-slate-900">{r.discountPercent}%</p>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-3">
                    <p className="text-xs text-slate-500">Clientes</p>
                    <p className="text-lg font-bold text-slate-900">{r.customersCount} <span className="text-xs font-normal text-slate-500">({r.paidCustomersCount} de pago)</span></p>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-3">
                    <p className="text-xs text-slate-500">Ingreso estimado</p>
                    <p className="text-lg font-bold text-slate-900">{currency(r.estimatedRevenueCents)} €</p>
                  </div>
                  <div className="rounded-lg bg-emerald-50 p-3">
                    <p className="text-xs text-emerald-600">Margen del reseller</p>
                    <p className="text-lg font-bold text-emerald-700">{currency(r.estimatedMarginCents)} €</p>
                  </div>
                </div>

                <div className="grid gap-2 sm:grid-cols-3">
                  {Object.entries(r.plans).map(([plan, p]) => (
                    <div key={plan} className="rounded border border-slate-200 p-3">
                      <p className="text-xs font-semibold text-slate-500">{plan}</p>
                      <p className="mt-1">
                        <span className="font-bold text-slate-900">{currency(p.public)} €</span>
                        <span className="text-xs text-slate-500"> público · costo {currency(p.wholesale)} €</span>
                      </p>
                    </div>
                  ))}
                </div>

                {editing?.id === r.id ? (
                  <div className="flex flex-wrap items-end gap-3 rounded-lg border border-indigo-200 bg-indigo-50/50 p-3">
                    <div>
                      <Label>Descuento %</Label>
                      <Input type="number" min={0} max={100} className="w-28" value={editing.discountPercent}
                        onChange={(e) => setEditing({ ...editing, discountPercent: parseInt(e.target.value || '0', 10) || 0 })} />
                    </div>
                    <div className="flex items-center gap-2 pb-1">
                      <Button size="sm" onClick={saveEdit} disabled={saving}>
                        {saving && <Loader2 className="mr-1 h-3 w-3 animate-spin" />} Guardar
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
                      <Button size="sm" variant="ghost"
                        onClick={() => { setEditing({ ...editing, isActive: !editing.isActive }); setTimeout(saveEdit, 0); }}>
                        {r.isActive ? 'Desactivar' : 'Activar'}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    <Button size="sm" variant="outline" onClick={() => setEditing({ id: r.id, discountPercent: r.discountPercent, isActive: r.isActive })}>
                      Editar descuento
                    </Button>
                    {!r.ownerEmail && (
                      <Button size="sm" variant="outline" onClick={() => setLinking({ id: r.id, email: '' })}>
                        Vincular cuenta
                      </Button>
                    )}
                  </div>
                )}

                {linking?.id === r.id && (
                  <div className="flex flex-wrap items-end gap-3 rounded-lg border border-amber-200 bg-amber-50/50 p-3">
                    <div className="min-w-64 flex-1">
                      <Label>Email de la cuenta del reseller</Label>
                      <Input value={linking.email} onChange={(e) => setLinking({ ...linking, email: e.target.value })} placeholder="panel@acme.com" />
                      <p className="mt-1 text-xs text-slate-500">La persona debe haberse registrado en Anytimebot con ese email.</p>
                    </div>
                    <Button size="sm" onClick={linkOwner} disabled={saving}>
                      {saving && <Loader2 className="mr-1 h-3 w-3 animate-spin" />} Vincular
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setLinking(null)}>Cancelar</Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}