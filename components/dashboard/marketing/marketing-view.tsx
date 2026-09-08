'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useTranslation } from '@/lib/i18n/hooks';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'react-hot-toast';
import { Megaphone, Ticket, Plus, Trash2, Send, Pencil, Users, Eye, AlertTriangle } from 'lucide-react';

interface Coupon {
  id: string;
  code: string;
  name: string | null;
  discountType: 'PERCENTAGE' | 'FIXED';
  discountValue: number;
  maxRedemptions: number;
  redemptions: number;
  isActive: boolean;
  startsAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}

interface Campaign {
  id: string;
  name: string;
  subject: string;
  htmlBody: string;
  channel: 'EMAIL' | 'WHATSAPP';
  audience: { mode: 'all' | 'tags'; tags?: string[] };
  couponCode: string | null;
  status: 'DRAFT' | 'SENDING' | 'SENT' | 'CANCELLED';
  sentAt: string | null;
  recipientsTotal: number;
  sentCount: number;
  failedCount: number;
  createdAt: string;
  _count?: { recipients: number };
}

interface MarketingData {
  coupons: Coupon[];
  campaigns: Campaign[];
  tags: string[];
  emailConfigured?: boolean;
  whatsappConnected?: boolean;
}

export function MarketingView() {
  const { t } = useTranslation('translation');
  const { data: session } = useSession();
  const isAdmin = ((session?.user as any)?.role || '') === 'ADMIN';
  const [data, setData] = useState<MarketingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [tab, setTab] = useState<'coupons' | 'campaigns'>('campaigns');

  const load = useCallback(() => {
    setLoading(true);
    fetch('/api/marketing')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('failed'))))
      .then((res) => setData(res.data))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // ---- Coupon modal ----
  const [couponOpen, setCouponOpen] = useState(false);
  const [couponForm, setCouponForm] = useState({
    code: '',
    name: '',
    discountType: 'PERCENTAGE',
    discountValue: '10',
    maxRedemptions: '0',
    expiresAt: '',
    isActive: true,
  });
  const [saving, setSaving] = useState(false);

  const openNewCoupon = () => {
    setCouponForm({
      code: '',
      name: '',
      discountType: 'PERCENTAGE',
      discountValue: '10',
      maxRedemptions: '0',
      expiresAt: '',
      isActive: true,
    });
    setCouponOpen(true);
  };

  const saveCoupon = async () => {
    if (!couponForm.code.trim()) {
      toast.error(t('marketing.couponCodeRequired'));
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/marketing/coupons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...couponForm,
          expiresAt: couponForm.expiresAt || undefined,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        toast.error(body.error || t('marketing.saveError'));
        return;
      }
      toast.success(t('marketing.couponCreated'));
      setCouponOpen(false);
      load();
    } catch {
      toast.error(t('marketing.saveError'));
    } finally {
      setSaving(false);
    }
  };

  const toggleCoupon = async (coupon: Coupon) => {
    const res = await fetch(`/api/marketing/coupons/${coupon.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !coupon.isActive }),
    });
    if (res.ok) load();
    else toast.error(t('marketing.saveError'));
  };

  const deleteCoupon = async (coupon: Coupon) => {
    if (!confirm(t('marketing.deleteConfirmCoupon'))) return;
    const res = await fetch(`/api/marketing/coupons/${coupon.id}`, { method: 'DELETE' });
    if (res.ok) {
      toast.success(t('marketing.deleted'));
      load();
    } else toast.error(t('marketing.saveError'));
  };

  // ---- Campaign modal ----
  const [campaignOpen, setCampaignOpen] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);
  const [campaignForm, setCampaignForm] = useState({
    name: '',
    subject: '',
    channel: 'EMAIL' as 'EMAIL' | 'WHATSAPP',
    audienceMode: 'all' as 'all' | 'tags',
    audienceTags: [] as string[],
    couponCode: '',
    htmlBody: '',
  });

  const openNewCampaign = () => {
    setEditingCampaign(null);
    setCampaignForm({
      name: '',
      subject: '',
      channel: 'EMAIL',
      audienceMode: 'all',
      audienceTags: [],
      couponCode: '',
      htmlBody:
        '<p>Hola {{nombre}},</p><p>Tenemos una oferta para ti. Reserva ahora:</p><p><strong>Código: {{codigo}}</strong></p>',
    });
    setCampaignOpen(true);
  };

  const openEditCampaign = (campaign: Campaign) => {
    setEditingCampaign(campaign);
    setCampaignForm({
      name: campaign.name,
      subject: campaign.subject,
      channel: campaign.channel === 'WHATSAPP' ? 'WHATSAPP' : 'EMAIL',
      audienceMode: campaign.audience?.mode === 'tags' ? 'tags' : 'all',
      audienceTags: campaign.audience?.tags || [],
      couponCode: campaign.couponCode || '',
      htmlBody: campaign.htmlBody,
    });
    setCampaignOpen(true);
  };

  const toggleTag = (tag: string) => {
    setCampaignForm((f) => ({
      ...f,
      audienceTags: f.audienceTags.includes(tag)
        ? f.audienceTags.filter((x) => x !== tag)
        : [...f.audienceTags, tag],
    }));
  };

  const saveCampaign = async () => {
    if (!campaignForm.name.trim() || !campaignForm.subject.trim() || !campaignForm.htmlBody.trim()) {
      toast.error(t('marketing.campaignFieldsRequired'));
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: campaignForm.name,
        subject: campaignForm.subject,
        channel: campaignForm.channel,
        htmlBody: campaignForm.htmlBody,
        couponCode: campaignForm.couponCode || undefined,
        audience: {
          mode: campaignForm.audienceMode,
          tags: campaignForm.audienceMode === 'tags' ? campaignForm.audienceTags : [],
        },
      };
      const res = editingCampaign
        ? await fetch(`/api/marketing/campaigns/${editingCampaign.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
        : await fetch('/api/marketing/campaigns', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
      const body = await res.json();
      if (!res.ok) {
        toast.error(body.error || t('marketing.saveError'));
        return;
      }
      toast.success(editingCampaign ? t('marketing.campaignSaved') : t('marketing.campaignCreated'));
      setCampaignOpen(false);
      load();
    } catch {
      toast.error(t('marketing.saveError'));
    } finally {
      setSaving(false);
    }
  };

  const deleteCampaign = async (campaign: Campaign) => {
    if (!confirm(t('marketing.deleteConfirmCampaign'))) return;
    const res = await fetch(`/api/marketing/campaigns/${campaign.id}`, { method: 'DELETE' });
    if (res.ok) {
      toast.success(t('marketing.deleted'));
      load();
    } else toast.error(t('marketing.saveError'));
  };

  // ---- Send dialog (with live per-channel audience estimate) ----
  const [sendTarget, setSendTarget] = useState<Campaign | null>(null);
  const [audienceInfo, setAudienceInfo] = useState<{
    total: number;
    email: number;
    whatsapp: number;
    skippedNoPhone: number;
    sample: string[];
  } | null>(null);
  const [audienceLoading, setAudienceLoading] = useState(false);

  const openSendDialog = async (campaign: Campaign) => {
    setSendTarget(campaign);
    setAudienceInfo(null);
    setAudienceLoading(true);
    try {
      const res = await fetch(`/api/marketing/campaigns/${campaign.id}/audience`);
      if (res.ok) {
        const body = await res.json();
        setAudienceInfo(body.data);
      }
    } catch {
      // estimate is optional
    } finally {
      setAudienceLoading(false);
    }
  };

  const sendCampaign = async () => {
    if (!sendTarget) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/marketing/campaigns/${sendTarget.id}/send`, { method: 'POST' });
      const body = await res.json();
      if (!res.ok) {
        toast.error(body.error || t('marketing.sendError'));
      } else {
        toast.success(
          t('marketing.sentSummary', {
            sent: body.data?.sent ?? 0,
            failed: body.data?.failed ?? 0,
          }) +
            (body.data?.skippedNoPhone > 0
              ? ` · ${t('marketing.skippedNoPhone', { count: body.data.skippedNoPhone })}`
              : ''),
        );
      }
      setSendTarget(null);
      load();
    } catch {
      toast.error(t('marketing.sendError'));
    } finally {
      setSaving(false);
    }
  };

  const statusBadge = (status: Campaign['status']) => {
    const map: Record<string, { label: string; cls: string }> = {
      DRAFT: { label: t('marketing.campaignStatusDraft'), cls: 'bg-slate-100 text-slate-600' },
      SENDING: { label: t('marketing.campaignStatusSending'), cls: 'bg-amber-50 text-amber-600' },
      SENT: { label: t('marketing.campaignStatusSent'), cls: 'bg-emerald-50 text-emerald-600' },
      CANCELLED: { label: t('marketing.campaignStatusCancelled'), cls: 'bg-red-50 text-red-600' },
    };
    const item = map[status] || map.DRAFT;
    return <Badge variant="secondary" className={item.cls}>{item.label}</Badge>;
  };

  const couponDisplay = (c: Coupon) =>
    c.discountType === 'PERCENTAGE' ? `${c.discountValue}%` : `${(c.discountValue / 100).toFixed(2)}€`;

  const couponState = (c: Coupon): { label: string; cls: string } => {
    if (!c.isActive) return { label: t('marketing.couponDisabled'), cls: 'bg-slate-100 text-slate-500' };
    if (c.expiresAt && new Date(c.expiresAt) <= new Date())
      return { label: t('marketing.couponExpired'), cls: 'bg-red-50 text-red-600' };
    return { label: t('marketing.couponActive'), cls: 'bg-emerald-50 text-emerald-600' };
  };

  const fmtDate = (value?: string | null) => {
    if (!value) return '—';
    const d = new Date(value);
    return isNaN(d.getTime())
      ? '—'
      : d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-slate-500">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-indigo-600" />
      </div>
    );
  }
  if (error || !data) {
    return <div className="py-24 text-center text-slate-500">{t('marketing.loadError')}</div>;
  }

  const showEmailWarning = data.emailConfigured === false;
  const showWhatsappWarning = data.whatsappConnected === false;
  const showAnyWarning = showEmailWarning || showWhatsappWarning;

  return (
    <div className="space-y-6">
      {showAnyWarning && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <div className="min-w-0 text-sm">
              <p className="font-semibold text-amber-800">{t('marketing.deliveryWarningTitle')}</p>
              <ul className="mt-1 list-inside list-disc space-y-0.5 text-amber-700">
                {showEmailWarning && <li>{t('marketing.emailNotConfigured')}</li>}
                {showWhatsappWarning && <li>{t('marketing.whatsappNotConnected')}</li>}
              </ul>
              <div className="mt-2 flex flex-wrap gap-2">
                {showEmailWarning && (
                  <a
                    href="mailto:support@anytimebot.app"
                    className="inline-flex items-center rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-100"
                  >
                    {t('marketing.configureEmail')}
                  </a>
                )}
                {showWhatsappWarning && isAdmin && (
                  <a
                    href="/admin/whatsapp"
                    className="inline-flex items-center rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-100"
                  >
                    {t('marketing.connectWhatsapp')}
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-50">
                <Megaphone className="h-5 w-5 text-indigo-600" />
              </div>
              <div>
                <CardTitle className="text-lg">{t('marketing.title')}</CardTitle>
                <CardDescription>{t('marketing.description')}</CardDescription>
              </div>
            </div>
            <Button
              type="button"
              onClick={() => (tab === 'coupons' ? openNewCoupon() : openNewCampaign())}
            >
              <Plus className="mr-1 h-4 w-4" />
              {tab === 'coupons' ? t('marketing.newCoupon') : t('marketing.newCampaign')}
            </Button>
          </div>
          <div className="mt-2 inline-flex rounded-lg border border-slate-200 p-0.5">
            {(['campaigns', 'coupons'] as const).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={`rounded-md px-4 py-1.5 text-sm font-medium transition ${
                  tab === key ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                {key === 'campaigns' ? t('marketing.tabCampaigns') : t('marketing.tabCoupons')}
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          {tab === 'campaigns' ? (
            data.campaigns.length === 0 ? (
              <div className="py-10 text-center">
                <Megaphone className="mx-auto h-10 w-10 text-slate-300" />
                <p className="mt-3 text-sm font-medium text-slate-600">{t('marketing.campaignsEmpty')}</p>
                <p className="mt-1 text-sm text-slate-400">{t('marketing.campaignsEmptyHint')}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {data.campaigns.map((campaign) => (
                  <div key={campaign.id} className="rounded-lg border border-slate-200 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold text-slate-800">{campaign.name}</p>
                          <Badge
                            variant="outline"
                            className={
                              campaign.channel === 'WHATSAPP'
                                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                : 'border-sky-200 bg-sky-50 text-sky-700'
                            }
                          >
                            {campaign.channel === 'WHATSAPP'
                              ? t('marketing.channelWhatsapp')
                              : t('marketing.channelEmail')}
                          </Badge>
                          {statusBadge(campaign.status)}
                          {campaign.couponCode && (
                            <Badge variant="outline" className="text-indigo-600">
                              <Ticket className="mr-1 h-3 w-3" />
                              {campaign.couponCode}
                            </Badge>
                          )}
                        </div>
                        <p className="mt-1 truncate text-sm text-slate-500">{campaign.subject}</p>
                        <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-400">
                          <Users className="h-3 w-3" />
                          {campaign.audience?.mode === 'tags'
                            ? `${t('marketing.audienceTags')}: ${(campaign.audience.tags || []).join(', ')}`
                            : t('marketing.audienceAll')}
                        </p>
                        {(campaign.status === 'SENT' || campaign.recipientsTotal > 0) && (
                          <p className="mt-1 text-xs text-slate-500">
                            {t('marketing.sent')}: {campaign.sentCount} · {t('marketing.failed')}:{' '}
                            {campaign.failedCount}
                            {campaign.sentAt ? ` · ${fmtDate(campaign.sentAt)}` : ''}
                          </p>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {campaign.status === 'DRAFT' && (
                          <>
                            <Button type="button" variant="outline" size="sm" onClick={() => openEditCampaign(campaign)}>
                              <Pencil className="mr-1 h-3.5 w-3.5" />
                              {t('marketing.edit')}
                            </Button>
                            <Button type="button" size="sm" onClick={() => openSendDialog(campaign)}>
                              <Send className="mr-1 h-3.5 w-3.5" />
                              {t('marketing.send')}
                            </Button>
                          </>
                        )}
                        {campaign.status !== 'SENDING' && (
                          <Button type="button" variant="ghost" size="icon" onClick={() => deleteCampaign(campaign)}>
                            <Trash2 className="h-4 w-4 text-slate-400" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : data.coupons.length === 0 ? (
            <div className="py-10 text-center">
              <Ticket className="mx-auto h-10 w-10 text-slate-300" />
              <p className="mt-3 text-sm font-medium text-slate-600">{t('marketing.couponsEmpty')}</p>
              <p className="mt-1 text-sm text-slate-400">{t('marketing.couponsEmptyHint')}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-slate-400">
                    <th className="py-2 pr-4 font-semibold">{t('marketing.couponCode')}</th>
                    <th className="py-2 pr-4 font-semibold">{t('marketing.couponDiscount')}</th>
                    <th className="py-2 pr-4 font-semibold">{t('marketing.couponUses')}</th>
                    <th className="py-2 pr-4 font-semibold">{t('marketing.couponExpiry')}</th>
                    <th className="py-2 pr-4 font-semibold">{t('marketing.status')}</th>
                    <th className="py-2 text-right font-semibold">{t('marketing.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.coupons.map((coupon) => {
                    const st = couponState(coupon);
                    return (
                      <tr key={coupon.id} className="border-b last:border-0 hover:bg-slate-50/60">
                        <td className="py-3 pr-4">
                          <p className="font-mono font-semibold text-indigo-600">{coupon.code}</p>
                          {coupon.name && <p className="text-xs text-slate-400">{coupon.name}</p>}
                        </td>
                        <td className="py-3 pr-4 font-medium text-slate-700">{couponDisplay(coupon)}</td>
                        <td className="py-3 pr-4 text-slate-500">
                          {coupon.redemptions}
                          {coupon.maxRedemptions > 0 ? ` / ${coupon.maxRedemptions}` : ` · ${t('marketing.couponUnlimited')}`}
                        </td>
                        <td className="whitespace-nowrap py-3 pr-4 text-slate-500">{fmtDate(coupon.expiresAt)}</td>
                        <td className="py-3 pr-4">
                          <Badge variant="secondary" className={st.cls}>{st.label}</Badge>
                        </td>
                        <td className="whitespace-nowrap py-3 text-right">
                          <Button type="button" variant="ghost" size="sm" onClick={() => toggleCoupon(coupon)}>
                            {coupon.isActive ? t('marketing.deactivate') : t('marketing.activate')}
                          </Button>
                          <Button type="button" variant="ghost" size="icon" onClick={() => deleteCoupon(coupon)}>
                            <Trash2 className="h-4 w-4 text-slate-400" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Coupon create dialog */}
      <Dialog open={couponOpen} onOpenChange={(open) => !open && setCouponOpen(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('marketing.newCoupon')}</DialogTitle>
            <DialogDescription>{t('marketing.couponDialogHint')}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div>
              <Label className="mb-1 block text-xs text-slate-500">{t('marketing.couponCode')}</Label>
              <Input
                value={couponForm.code}
                onChange={(e) => setCouponForm({ ...couponForm, code: e.target.value.toUpperCase() })}
                placeholder="VERANO10"
                className="font-mono uppercase"
              />
            </div>
            <div>
              <Label className="mb-1 block text-xs text-slate-500">{t('marketing.couponName')}</Label>
              <Input
                value={couponForm.name}
                onChange={(e) => setCouponForm({ ...couponForm, name: e.target.value })}
                placeholder={t('marketing.couponNamePlaceholder')}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="mb-1 block text-xs text-slate-500">{t('marketing.discountType')}</Label>
                <Select
                  value={couponForm.discountType}
                  onValueChange={(v) => setCouponForm({ ...couponForm, discountType: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PERCENTAGE">{t('marketing.discountTypePct')}</SelectItem>
                    <SelectItem value="FIXED">{t('marketing.discountTypeFixed')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="mb-1 block text-xs text-slate-500">{t('marketing.couponValue')}</Label>
                <Input
                  type="number"
                  value={couponForm.discountValue}
                  onChange={(e) => setCouponForm({ ...couponForm, discountValue: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="mb-1 block text-xs text-slate-500">{t('marketing.maxUses')}</Label>
                <Input
                  type="number"
                  value={couponForm.maxRedemptions}
                  onChange={(e) => setCouponForm({ ...couponForm, maxRedemptions: e.target.value })}
                />
              </div>
              <div>
                <Label className="mb-1 block text-xs text-slate-500">{t('marketing.expiresAt')}</Label>
                <Input
                  type="date"
                  value={couponForm.expiresAt}
                  onChange={(e) => setCouponForm({ ...couponForm, expiresAt: e.target.value })}
                />
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2">
              <span className="text-sm text-slate-600">{t('marketing.active')}</span>
              <Switch checked={couponForm.isActive} onCheckedChange={(v) => setCouponForm({ ...couponForm, isActive: v })} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCouponOpen(false)}>
              {t('marketing.cancel')}
            </Button>
            <Button type="button" disabled={saving} onClick={saveCoupon}>
              {saving ? '…' : t('marketing.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Campaign create/edit dialog */}
      <Dialog open={campaignOpen} onOpenChange={(open) => !open && setCampaignOpen(false)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingCampaign ? t('marketing.editCampaign') : t('marketing.newCampaign')}
            </DialogTitle>
            <DialogDescription>{t('marketing.campaignDialogHint')}</DialogDescription>
          </DialogHeader>
          <div className="grid max-h-[65vh] gap-4 overflow-y-auto pr-1">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label className="mb-1 block text-xs text-slate-500">{t('marketing.campaignName')}</Label>
                <Input
                  value={campaignForm.name}
                  onChange={(e) => setCampaignForm({ ...campaignForm, name: e.target.value })}
                  placeholder={t('marketing.campaignNamePlaceholder')}
                />
              </div>
              <div>
                <Label className="mb-1 block text-xs text-slate-500">{t('marketing.subject')}</Label>
                <Input
                  value={campaignForm.subject}
                  onChange={(e) => setCampaignForm({ ...campaignForm, subject: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label className="mb-1 block text-xs text-slate-500">{t('marketing.channel')}</Label>
                <Select
                  value={campaignForm.channel}
                  onValueChange={(v) =>
                    setCampaignForm({ ...campaignForm, channel: v as 'EMAIL' | 'WHATSAPP' })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="EMAIL">{t('marketing.channelEmail')}</SelectItem>
                    <SelectItem value="WHATSAPP">{t('marketing.channelWhatsapp')}</SelectItem>
                  </SelectContent>
                </Select>
                {campaignForm.channel === 'WHATSAPP' && (
                  <p className="mt-1 text-xs text-amber-600">{t('marketing.whatsappHint')}</p>
                )}
              </div>
              <div>
                <Label className="mb-1 block text-xs text-slate-500">{t('marketing.attachCoupon')}</Label>
                <Select
                  value={campaignForm.couponCode || 'none'}
                  onValueChange={(v) =>
                    setCampaignForm({ ...campaignForm, couponCode: v === 'none' ? '' : v })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t('marketing.couponNone')}</SelectItem>
                    {data.coupons.map((c) => (
                      <SelectItem key={c.id} value={c.code}>
                        {c.code} · {couponDisplay(c)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="mb-1 block text-xs text-slate-500">{t('marketing.audience')}</Label>
              <Select
                value={campaignForm.audienceMode}
                onValueChange={(v) =>
                  setCampaignForm({ ...campaignForm, audienceMode: v as 'all' | 'tags' })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('marketing.audienceAll')}</SelectItem>
                  <SelectItem value="tags">{t('marketing.audienceTags')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {campaignForm.audienceMode === 'tags' && (
              <div>
                <Label className="mb-1 block text-xs text-slate-500">{t('marketing.pickTags')}</Label>
                <div className="flex flex-wrap gap-2">
                  {data.tags.length === 0 ? (
                    <p className="text-sm text-slate-400">{t('marketing.noTags')}</p>
                  ) : (
                    data.tags.map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => toggleTag(tag)}
                        className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                          campaignForm.audienceTags.includes(tag)
                            ? 'bg-indigo-600 text-white'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        {tag}
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}

            <div>
              <Label className="mb-1 block text-xs text-slate-500">{t('marketing.body')}</Label>
              <Textarea
                rows={8}
                className="font-mono text-xs"
                value={campaignForm.htmlBody}
                onChange={(e) => setCampaignForm({ ...campaignForm, htmlBody: e.target.value })}
              />
              <p className="mt-1 text-xs text-slate-400">{t('marketing.bodyHint')}</p>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCampaignOpen(false)}>
              {t('marketing.cancel')}
            </Button>
            <Button type="button" disabled={saving} onClick={saveCampaign}>
              {saving ? '…' : t('marketing.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Send confirm dialog */}
      <Dialog open={!!sendTarget} onOpenChange={(open) => !open && setSendTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('marketing.sendConfirmTitle')}</DialogTitle>
            <DialogDescription>{t('marketing.sendConfirmText')}</DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm">
            {audienceLoading ? (
              <p className="text-slate-400">{t('marketing.estimating')}</p>
            ) : audienceInfo ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div
                    className={`rounded-lg border p-3 ${
                      sendTarget?.channel === 'EMAIL'
                        ? 'border-indigo-300 bg-indigo-50'
                        : 'border-slate-200 bg-white'
                    }`}
                  >
                    <p className="text-xs font-medium text-slate-500">{t('marketing.channelEmail')}</p>
                    <p className="mt-0.5 text-xl font-bold text-slate-800">{audienceInfo.email}</p>
                    <p className="text-xs text-slate-400">{t('marketing.willReceive')}</p>
                  </div>
                  <div
                    className={`rounded-lg border p-3 ${
                      sendTarget?.channel === 'WHATSAPP'
                        ? 'border-emerald-300 bg-emerald-50'
                        : 'border-slate-200 bg-white'
                    }`}
                  >
                    <p className="text-xs font-medium text-slate-500">{t('marketing.channelWhatsapp')}</p>
                    <p className="mt-0.5 text-xl font-bold text-slate-800">{audienceInfo.whatsapp}</p>
                    <p className="text-xs text-slate-400">{t('marketing.willReceive')}</p>
                  </div>
                </div>
                {audienceInfo.skippedNoPhone > 0 && (
                  <p className="text-xs text-amber-600">
                    {t('marketing.skippedNoPhone', { count: audienceInfo.skippedNoPhone })}
                  </p>
                )}
                {audienceInfo.sample.length > 0 && (
                  <p className="text-xs text-slate-400">
                    <Eye className="mr-1 inline h-3.5 w-3.5 align-[-2px]" />
                    {audienceInfo.sample.join(' · ')}
                    {audienceInfo.total > audienceInfo.sample.length ? '…' : ''}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-slate-400">{t('marketing.estimatingError')}</p>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setSendTarget(null)}>
              {t('marketing.cancel')}
            </Button>
            <Button
              type="button"
              disabled={
                saving ||
                (!!audienceInfo &&
                  (sendTarget?.channel === 'WHATSAPP'
                    ? audienceInfo.whatsapp === 0
                    : audienceInfo.email === 0))
              }
              onClick={sendCampaign}
            >
              {saving ? '…' : t('marketing.send')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
