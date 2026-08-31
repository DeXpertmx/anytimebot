'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Save, CreditCard, ShieldCheck, FlaskConical } from 'lucide-react';
import { toast } from 'sonner';

interface GlobalSettings {
  freeAiInteractions: number;
  proAiInteractions: number;
  teamAiInteractions: number;
  proVideoMinutes: number;
  teamVideoMinutes: number;
}

type StripeMode = 'test' | 'live';

interface StripeModeStatus {
  mode: StripeMode;
  modes: Record<
    StripeMode,
    {
      configured: boolean;
      secretKey: boolean;
      publishableKey: boolean;
      webhookSecret: boolean;
      pricePro: boolean;
      priceTeam: boolean;
    }
  >;
}

const MISSING_ITEMS = [
  { key: 'secretKey', label: 'Secret key' },
  { key: 'publishableKey', label: 'Publishable key' },
  { key: 'webhookSecret', label: 'Webhook secret' },
  { key: 'pricePro', label: 'Pro price ID' },
  { key: 'priceTeam', label: 'Team price ID' },
] as const;

export default function SettingsPage() {
  const [settings, setSettings] = useState<GlobalSettings>({
    freeAiInteractions: 0,
    proAiInteractions: 200,
    teamAiInteractions: 500,
    proVideoMinutes: 100,
    teamVideoMinutes: 500,
  });
  const [saving, setSaving] = useState(false);

  const [stripe, setStripe] = useState<StripeModeStatus | null>(null);
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    fetch('/api/admin/stripe-mode')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => data && setStripe(data))
      .catch(() => undefined);
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const response = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });

      if (response.ok) {
        toast.success('Settings saved successfully');
      } else {
        toast.error('Failed to save settings');
      }
    } catch (error) {
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleSwitchMode = async (mode: StripeMode) => {
    if (!stripe || stripe.mode === mode) return;
    if (!stripe.modes[mode].configured) {
      toast.error(`Cannot switch: the ${mode} mode is missing required Stripe configuration`);
      return;
    }
    setSwitching(true);
    try {
      const response = await fetch('/api/admin/stripe-mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
      });
      if (response.ok) {
        const data = await response.json();
        setStripe(data);
        toast.success(`Stripe mode switched to ${mode}`);
      } else {
        const data = await response.json().catch(() => ({}));
        toast.error(data.error || 'Failed to switch mode');
      }
    } catch (error) {
      toast.error('Failed to switch mode');
    } finally {
      setSwitching(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Global Settings</h1>
        <p className="text-muted-foreground">Configure system-wide parameters and quotas</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Stripe Mode
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Switch between test and live payments without redeploying. In test mode
            no real money is charged — use Stripe test cards. Live mode charges real
            customers.
          </p>

          {stripe ? (
            <div className="grid gap-4 md:grid-cols-2">
              {(['live', 'test'] as StripeMode[]).map((mode) => {
                const info = stripe.modes[mode];
                const active = stripe.mode === mode;
                const missing = MISSING_ITEMS.filter((item) => !info[item.key]);
                return (
                  <div
                    key={mode}
                    className={`rounded-lg border p-4 ${
                      active ? 'border-indigo-500 bg-indigo-50/50' : 'border-gray-200'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 font-semibold">
                        {mode === 'live' ? (
                          <ShieldCheck className="h-4 w-4 text-emerald-600" />
                        ) : (
                          <FlaskConical className="h-4 w-4 text-amber-500" />
                        )}
                        {mode === 'live' ? 'Production (live)' : 'Test mode'}
                      </div>
                      {active && (
                        <span className="rounded-full bg-indigo-600 px-2 py-0.5 text-xs font-medium text-white">
                          Active
                        </span>
                      )}
                    </div>
                    <p className="mt-2 text-sm">
                      {info.configured ? (
                        <span className="text-emerald-600">Fully configured</span>
                      ) : (
                        <span className="text-amber-600">Incomplete ({missing.length} missing)</span>
                      )}
                    </p>
                    {!info.configured && (
                      <ul className="mt-2 list-inside list-disc text-xs text-muted-foreground">
                        {missing.map((item) => (
                          <li key={item.key}>{item.label}</li>
                        ))}
                      </ul>
                    )}
                    {!active && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-3"
                        disabled={switching}
                        onClick={() => handleSwitchMode(mode)}
                      >
                        {switching ? 'Switching...' : `Switch to ${mode === 'live' ? 'Production' : 'Test'}`}
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Loading Stripe mode...</p>
          )}

          <p className="text-xs text-muted-foreground">
            Variables used: STRIPE_SECRET_KEY(_LIVE)/_TEST, NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY(_LIVE)/_TEST,
            STRIPE_WEBHOOK_SECRET(_LIVE)/_TEST, STRIPE_PRICE_PRO/TEAM(_LIVE)/_TEST.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Plan Quotas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label>Free - AI Interactions/month</Label>
              <Input
                type="number"
                value={settings.freeAiInteractions}
                onChange={(e) => setSettings({ ...settings, freeAiInteractions: parseInt(e.target.value) })}
              />
            </div>

            <div className="space-y-2">
              <Label>Pro - AI Interactions/month</Label>
              <Input
                type="number"
                value={settings.proAiInteractions}
                onChange={(e) => setSettings({ ...settings, proAiInteractions: parseInt(e.target.value) })}
              />
            </div>

            <div className="space-y-2">
              <Label>Team - AI Interactions/month</Label>
              <Input
                type="number"
                value={settings.teamAiInteractions}
                onChange={(e) => setSettings({ ...settings, teamAiInteractions: parseInt(e.target.value) })}
              />
            </div>

            <div className="space-y-2">
              <Label>Pro - Video Minutes/month</Label>
              <Input
                type="number"
                value={settings.proVideoMinutes}
                onChange={(e) => setSettings({ ...settings, proVideoMinutes: parseInt(e.target.value) })}
              />
            </div>

            <div className="space-y-2">
              <Label>Team - Video Minutes/month</Label>
              <Input
                type="number"
                value={settings.teamVideoMinutes}
                onChange={(e) => setSettings({ ...settings, teamVideoMinutes: parseInt(e.target.value) })}
              />
            </div>
          </div>

          <div className="pt-4 border-t">
            <Button onClick={handleSave} disabled={saving}>
              <Save className="h-4 w-4 mr-2" />
              {saving ? 'Saving...' : 'Save Settings'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>System Information</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between py-2 border-b">
              <span className="text-muted-foreground">Environment</span>
              <span className="font-medium">Production</span>
            </div>
            <div className="flex justify-between py-2 border-b">
              <span className="text-muted-foreground">Database</span>
              <span className="font-medium">PostgreSQL</span>
            </div>
            <div className="flex justify-between py-2">
              <span className="text-muted-foreground">Version</span>
              <span className="font-medium">1.0.0</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}