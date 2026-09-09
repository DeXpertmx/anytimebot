'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Save, CreditCard, ShieldCheck, FlaskConical, KeyRound, Trash2, Link2, Check, Mail, HardDrive } from 'lucide-react';
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
      stored: boolean;
      secretKey: boolean;
      publishableKey: boolean;
      webhookSecret: boolean;
      pricePro: boolean;
      priceTeam: boolean;
    }
  >;
}

interface StripeCredentialsForm {
  secretKey: string;
  publishableKey: string;
  webhookSecret: string;
  pricePro: string;
  priceTeam: string;
}

const MISSING_ITEMS = [
  { key: 'secretKey', label: 'Secret key' },
  { key: 'publishableKey', label: 'Publishable key' },
  { key: 'webhookSecret', label: 'Webhook secret' },
  { key: 'pricePro', label: 'Pro price ID' },
  { key: 'priceTeam', label: 'Team price ID' },
] as const;

const CREDENTIAL_FIELDS: Array<{ key: keyof StripeCredentialsForm; label: string; sensitive?: boolean; placeholder: string }> = [
  { key: 'secretKey', label: 'Secret key', sensitive: true, placeholder: 'sk_live_... or sk_test_...' },
  { key: 'publishableKey', label: 'Publishable key', placeholder: 'pk_live_... or pk_test_...' },
  { key: 'webhookSecret', label: 'Webhook secret', sensitive: true, placeholder: 'whsec_...' },
  { key: 'pricePro', label: 'Pro price ID', placeholder: 'price_...' },
  { key: 'priceTeam', label: 'Team price ID', placeholder: 'price_...' },
];

const EMPTY_FORM: StripeCredentialsForm = {
  secretKey: '',
  publishableKey: '',
  webhookSecret: '',
  pricePro: '',
  priceTeam: '',
};

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
  const [editingMode, setEditingMode] = useState<StripeMode | null>(null);
  const [credentials, setCredentials] = useState<StripeModeStatus['modes']>({
    live: { ...EMPTY_FORM },
    test: { ...EMPTY_FORM },
  } as unknown as StripeModeStatus['modes']);
  const [savingCreds, setSavingCreds] = useState(false);
  const [clearingCreds, setClearingCreds] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState('https://anytimebot.app/api/stripe/webhook');

  // --- Fallback: paste raw keys and save via API with visible error output ---
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteMode, setPasteMode] = useState<StripeMode>('test');
  const [pasteText, setPasteText] = useState('');
  const [pasteBusy, setPasteBusy] = useState(false);
  const [pasteResult, setPasteResult] = useState<{ ok: boolean; detail: string } | null>(null);

  const parsePastedKeys = (text: string): Partial<StripeCredentialsForm> => {
    const found: Partial<StripeCredentialsForm> = {};
    const priceIds: string[] = [];
    for (const token of text.match(/\b(?:sk_test|sk_live|pk_test|pk_live|whsec)_[A-Za-z0-9_]+\b|\bprice_[A-Za-z0-9_]+\b/g) || []) {
      if (token.startsWith('sk_')) found.secretKey = token;
      else if (token.startsWith('pk_')) found.publishableKey = token;
      else if (token.startsWith('whsec_')) found.webhookSecret = token;
      else if (token.startsWith('price_')) priceIds.push(token);
    }
    if (priceIds[0]) found.pricePro = priceIds[0];
    if (priceIds[1]) found.priceTeam = priceIds[1];
    return found;
  };

  const handlePasteSave = async () => {
    const parsed = parsePastedKeys(pasteText);
    const detected = Object.keys(parsed) as Array<keyof StripeCredentialsForm>;
    if (detected.length === 0) {
      setPasteResult({ ok: false, detail: 'No Stripe keys recognised. Expected tokens starting with sk_test_, pk_test_, whsec_ or price_.' });
      return;
    }
    setPasteBusy(true);
    setPasteResult(null);
    try {
      const res = await fetch('/api/admin/stripe-credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: pasteMode, credentials: parsed }),
      });
      const bodyText = await res.text();
      if (res.ok) {
        setPasteResult({ ok: true, detail: `HTTP ${res.status} — ${res.statusText || 'OK'} — saved fields: ${detected.join(', ')} (${pasteMode} mode)\n${bodyText}` });
        toast.success(`Keys saved for ${pasteMode} mode`);
        setPasteText('');
        const status = await fetch('/api/admin/stripe-mode').then((r) => r.json());
        setStripe(status);
      } else {
        setPasteResult({ ok: false, detail: `HTTP ${res.status} ${res.statusText}\n${bodyText || '(empty response body)'}` });
        toast.error(`Save failed — HTTP ${res.status} (details below)`);
      }
    } catch (error) {
      const msg = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
      setPasteResult({ ok: false, detail: `Network error — the request never reached the server.\n${msg}` });
      toast.error('Network error (details below)');
    } finally {
      setPasteBusy(false);
    }
  };

  const [emailStatus, setEmailStatus] = useState<{ configured: boolean; stored: boolean; source: string; provider: 'smtp' | 'resend' } | null>(null);
  const [emailTab, setEmailTab] = useState<'smtp' | 'resend'>('smtp');
  const [emailApiKey, setEmailApiKey] = useState('');
  const [smtpForm, setSmtpForm] = useState({
    smtpHost: '',
    smtpPort: '',
    smtpSecure: false,
    smtpUser: '',
    smtpPass: '',
    smtpFromName: '',
    smtpFromEmail: '',
  });
  const [savingEmail, setSavingEmail] = useState(false);
  const [clearingEmail, setClearingEmail] = useState(false);
  const [testingEmail, setTestingEmail] = useState(false);
  const [testEmailTo, setTestEmailTo] = useState('');
  const [storageStatus, setStorageStatus] = useState<{
    configured: boolean;
    stored: boolean;
    source: string;
    endpoint: string;
    bucket: string;
    region: string;
  } | null>(null);
  const [storageForm, setStorageForm] = useState({
    endpoint: '',
    accessKey: '',
    secretKey: '',
    bucket: '',
    region: '',
    forcePathStyle: true,
  });
  const [savingStorage, setSavingStorage] = useState(false);
  const [clearingStorage, setClearingStorage] = useState(false);
  const [testingStorage, setTestingStorage] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.location?.origin) {
      setWebhookUrl(`${window.location.origin}/api/stripe/webhook`);
    }
  }, []);

  useEffect(() => {
    fetch('/api/admin/stripe-mode')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => data && setStripe(data))
      .catch(() => undefined);

    fetch('/api/admin/email-credentials')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => data && setEmailStatus(data))
      .catch(() => undefined);

    fetch('/api/admin/storage-credentials')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => data && setStorageStatus(data))
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

  const handleSaveCredentials = async (mode: StripeMode) => {
    const creds = credentials[mode];
    const hasValue = CREDENTIAL_FIELDS.some((field) => (creds as any)[field.key] !== '');
    if (!hasValue) {
      toast.error('Enter at least one value');
      return;
    }
    setSavingCreds(true);
    try {
      const response = await fetch('/api/admin/stripe-credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, credentials: creds }),
      });
      if (response.ok) {
        toast.success(`Credentials saved for ${mode} mode`);
        setEditingMode(null);
        setCredentials((prev) => ({ ...prev, [mode]: { ...EMPTY_FORM } }));
        const status = await fetch('/api/admin/stripe-mode').then((r) => r.json());
        setStripe(status);
      } else {
        const data = await response.json().catch(() => ({}));
        toast.error(data.error || 'Failed to save credentials');
      }
    } catch (error) {
      toast.error('Failed to save credentials');
    } finally {
      setSavingCreds(false);
    }
  };

  const refreshEmailStatus = async () => {
    const data = await fetch('/api/admin/email-credentials')
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
    if (data) setEmailStatus(data);
  };

  const handleSaveEmail = async () => {
    let payload: Record<string, string | boolean>;
    if (emailTab === 'resend') {
      if (!emailApiKey.trim()) {
        toast.error('Enter the Resend API key');
        return;
      }
      payload = { apiKey: emailApiKey.trim() };
    } else {
      if (!smtpForm.smtpHost.trim()) {
        toast.error('Enter the SMTP host');
        return;
      }
      payload = {
        provider: 'auto',
        smtpHost: smtpForm.smtpHost.trim(),
        smtpPort: smtpForm.smtpPort.trim(),
        smtpSecure: smtpForm.smtpSecure,
        smtpUser: smtpForm.smtpUser.trim(),
        smtpPass: smtpForm.smtpPass.trim(),
        smtpFromName: smtpForm.smtpFromName.trim(),
        smtpFromEmail: smtpForm.smtpFromEmail.trim(),
      };
    }
    setSavingEmail(true);
    try {
      const response = await fetch('/api/admin/email-credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (response.ok) {
        toast.success('Email credentials saved — system emails are now enabled');
        setEmailApiKey('');
        setSmtpForm({ smtpHost: '', smtpPort: '', smtpSecure: false, smtpUser: '', smtpPass: '', smtpFromName: '', smtpFromEmail: '' });
        await refreshEmailStatus();
      } else {
        const data = await response.json().catch(() => ({}));
        toast.error(data.error || 'Failed to save email credentials');
      }
    } catch (error) {
      toast.error('Failed to save email credentials');
    } finally {
      setSavingEmail(false);
    }
  };

  const handleTestEmail = async () => {
    if (testEmailTo.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(testEmailTo.trim())) {
      toast.error('Enter a valid recipient email');
      return;
    }
    setTestingEmail(true);
    try {
      const response = await fetch('/api/admin/email-credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ test: true, to: testEmailTo.trim() || undefined }),
      });
      if (response.ok) {
        const data = await response.json();
        const recipient = data.to || 'the registered account email';
        toast.success(`Test email sent to ${recipient} via ${data.provider === 'smtp' ? 'SMTP' : 'Resend'}`);
      } else {
        const data = await response.json().catch(() => ({}));
        toast.error(data.error || 'Test email failed');
      }
    } catch (error) {
      toast.error('Test email failed');
    } finally {
      setTestingEmail(false);
    }
  };

  const handleClearEmail = async () => {
    setClearingEmail(true);
    try {
      const response = await fetch('/api/admin/email-credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clear: true }),
      });
      if (response.ok) {
        toast.success('Saved email credentials cleared (env vars still apply)');
        await refreshEmailStatus();
      } else {
        const data = await response.json().catch(() => ({}));
        toast.error(data.error || 'Failed to clear email credentials');
      }
    } catch (error) {
      toast.error('Failed to clear email credentials');
    } finally {
      setClearingEmail(false);
    }
  };

  const refreshStorageStatus = async () => {
    const data = await fetch('/api/admin/storage-credentials')
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
    if (data) setStorageStatus(data);
  };

  const handleSaveStorage = async () => {
    if (!storageForm.endpoint.trim()) {
      toast.error('Enter the storage endpoint URL');
      return;
    }
    setSavingStorage(true);
    try {
      const response = await fetch('/api/admin/storage-credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...storageForm,
          endpoint: storageForm.endpoint.trim(),
          accessKey: storageForm.accessKey.trim(),
          secretKey: storageForm.secretKey.trim(),
          bucket: storageForm.bucket.trim(),
          region: storageForm.region.trim(),
          forcePathStyle: storageForm.forcePathStyle,
        }),
      });
      if (response.ok) {
        toast.success('Storage credentials saved — logo uploads are now enabled');
        setStorageForm({ endpoint: '', accessKey: '', secretKey: '', bucket: '', region: '', forcePathStyle: true });
        await refreshStorageStatus();
      } else {
        const data = await response.json().catch(() => ({}));
        toast.error(data.error || 'Failed to save storage credentials');
      }
    } catch (error) {
      toast.error('Failed to save storage credentials');
    } finally {
      setSavingStorage(false);
    }
  };

  const handleTestStorage = async () => {
    setTestingStorage(true);
    try {
      const response = await fetch('/api/admin/storage-credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ test: true }),
      });
      if (response.ok) {
        const data = await response.json();
        toast.success(`Storage connection OK (bucket: ${data.bucket})`);
      } else {
        const data = await response.json().catch(() => ({}));
        toast.error(data.error || 'Storage connection failed');
      }
    } catch (error) {
      toast.error('Storage connection failed');
    } finally {
      setTestingStorage(false);
    }
  };

  const handleClearStorage = async () => {
    setClearingStorage(true);
    try {
      const response = await fetch('/api/admin/storage-credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clear: true }),
      });
      if (response.ok) {
        toast.success('Saved storage credentials cleared (env vars still apply)');
        await refreshStorageStatus();
      } else {
        const data = await response.json().catch(() => ({}));
        toast.error(data.error || 'Failed to clear storage credentials');
      }
    } catch (error) {
      toast.error('Failed to clear storage credentials');
    } finally {
      setClearingStorage(false);
    }
  };

  const handleClearCredentials = async (mode: StripeMode) => {
    setClearingCreds(true);
    try {
      const response = await fetch('/api/admin/stripe-credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, clear: true }),
      });
      if (response.ok) {
        toast.success(`Saved credentials cleared for ${mode} mode (env vars still apply)`);
        const status = await fetch('/api/admin/stripe-mode').then((r) => r.json());
        setStripe(status);
      } else {
        const data = await response.json().catch(() => ({}));
        toast.error(data.error || 'Failed to clear credentials');
      }
    } catch (error) {
      toast.error('Failed to clear credentials');
    } finally {
      setClearingCreds(false);
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
            customers. Credentials can be entered below or set as environment variables.
          </p>

          {stripe ? (
            <>
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-muted/40 p-3">
              <div className="min-w-0">
                <p className="text-xs font-medium text-muted-foreground">Webhook endpoint (same URL for test and live)</p>
                <code className="block truncate font-mono text-sm">{webhookUrl}</code>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(webhookUrl);
                    setCopiedUrl(true);
                    setTimeout(() => setCopiedUrl(false), 1500);
                  } catch {
                    toast.error('Could not copy URL');
                  }
                }}
              >
                {copiedUrl ? <Check className="h-4 w-4 mr-1" /> : <Link2 className="h-4 w-4 mr-1" />}
                {copiedUrl ? 'Copied' : 'Copy'}
              </Button>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {(['live', 'test'] as StripeMode[]).map((mode) => {
                const info = stripe.modes[mode];
                const active = stripe.mode === mode;
                const missing = MISSING_ITEMS.filter((item) => !info[item.key]);
                const editing = editingMode === mode;
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
                        <span className="text-emerald-600">
                          Fully configured{info.stored ? ' (stored in database)' : ' (env vars)'}
                        </span>
                      ) : (
                        <span className="text-amber-600">
                          Incomplete ({missing.length} missing)
                        </span>
                      )}
                    </p>
                    {!info.configured && (
                      <ul className="mt-2 list-inside list-disc text-xs text-muted-foreground">
                        {missing.map((item) => (
                          <li key={item.key}>{item.label}</li>
                        ))}
                      </ul>
                    )}

                    {editing ? (
                      <div className="mt-3 space-y-2 rounded-md border border-dashed p-3">
                        {CREDENTIAL_FIELDS.map((field) => (
                          <div key={field.key} className="space-y-1">
                            <Label className="text-xs">{field.label}</Label>
                            <Input
                              type={field.sensitive ? 'password' : 'text'}
                              placeholder={field.placeholder}
                              value={(credentials[mode] as any)[field.key]}
                              onChange={(e) =>
                                setCredentials((prev) => ({
                                  ...prev,
                                  [mode]: { ...prev[mode], [field.key]: e.target.value },
                                }))
                              }
                            />
                          </div>
                        ))}
                        <div className="flex gap-2 pt-1">
                          <Button size="sm" disabled={savingCreds} onClick={() => handleSaveCredentials(mode)}>
                            <KeyRound className="h-4 w-4 mr-1" />
                            {savingCreds ? 'Saving...' : 'Save credentials'}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setEditingMode(null)}
                            disabled={savingCreds}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button size="sm" variant="outline" onClick={() => setEditingMode(mode)}>
                          <KeyRound className="h-4 w-4 mr-1" />
                          {info.stored ? 'Edit credentials' : 'Add credentials'}
                        </Button>
                        {info.stored && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={clearingCreds}
                            onClick={() => handleClearCredentials(mode)}
                          >
                            <Trash2 className="h-4 w-4 mr-1" />
                            Clear
                          </Button>
                        )}
                        {!active && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={switching}
                            onClick={() => handleSwitchMode(mode)}
                          >
                            {switching ? 'Switching...' : `Switch to ${mode === 'live' ? 'Production' : 'Test'}`}
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Fallback: paste raw keys (visible server output on any outcome) */}
            <div className="rounded-lg border border-dashed p-4">
              <button
                type="button"
                className="flex w-full items-center justify-between text-sm font-medium"
                onClick={() => setPasteOpen((v) => !v)}
              >
                <span>Paste keys directly (fallback)</span>
                <span className="text-muted-foreground">{pasteOpen ? '−' : '+'}</span>
              </button>
              {pasteOpen && (
                <div className="mt-3 space-y-2">
                  <p className="text-xs text-muted-foreground">
                    Paste the keys anywhere in the box — tokens are auto-detected by prefix
                    (sk_test_/sk_live_ → secret, pk_… → publishable, whsec_… → webhook secret,
                    first/second price_… → Pro/Team price).
                  </p>
                  <div className="flex items-center gap-2">
                    <Label className="text-xs">Mode</Label>
                    <select
                      className="rounded-md border bg-transparent px-2 py-1 text-sm"
                      value={pasteMode}
                      onChange={(e) => setPasteMode(e.target.value as StripeMode)}
                    >
                      <option value="test">test</option>
                      <option value="live">live</option>
                    </select>
                  </div>
                  <textarea
                    className="min-h-[90px] w-full rounded-md border bg-transparent p-2 font-mono text-xs"
                    placeholder={'sk_test_…\npk_test_…\nwhsec_…'}
                    value={pasteText}
                    onChange={(e) => setPasteText(e.target.value)}
                  />
                  <div className="flex gap-2">
                    <Button size="sm" disabled={pasteBusy || !pasteText.trim()} onClick={handlePasteSave}>
                      <KeyRound className="h-4 w-4 mr-1" />
                      {pasteBusy ? 'Saving…' : 'Save keys'}
                    </Button>
                    {pasteResult && (
                      <Button size="sm" variant="outline" onClick={() => setPasteResult(null)} disabled={pasteBusy}>
                        Dismiss result
                      </Button>
                    )}
                  </div>
                  {pasteResult && (
                    <pre
                      className={`max-h-40 overflow-auto whitespace-pre-wrap rounded-md border p-2 text-xs ${
                        pasteResult.ok
                          ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                          : 'border-red-300 bg-red-50 text-red-800'
                      }`}
                    >
                      {pasteResult.detail}
                    </pre>
                  )}
                </div>
              )}
            </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Loading Stripe mode...</p>
          )}

          <p className="text-xs text-muted-foreground">
            Credentials saved here take precedence over environment variables. Env fallbacks:
            STRIPE_SECRET_KEY(_LIVE)/_TEST, NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY(_LIVE)/_TEST,
            STRIPE_WEBHOOK_SECRET(_LIVE)/_TEST, STRIPE_PRICE_PRO/TEAM(_LIVE)/_TEST.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Email (SMTP / Resend)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            System emails (booking confirmations, reminders, membership welcome/overdue,
            feedback surveys, briefings) are sent through SMTP when configured,
            falling back to Resend. Configure your provider here without touching
            environment variables or redeploying.
          </p>

          <div className="flex flex-wrap items-center gap-3 rounded-md border bg-muted/40 p-3">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-muted-foreground">Status</p>
              {emailStatus ? (
                <p className="text-sm">
                  {emailStatus.configured ? (
                    <span className="text-emerald-600">
                      Configured via {emailStatus.provider === 'smtp' ? 'SMTP' : 'Resend'}{' '}
                      ({emailStatus.source === 'database' ? 'stored in database' : 'environment variables'})
                    </span>
                  ) : (
                    <span className="text-amber-600">Not configured — emails are disabled</span>
                  )}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">Checking...</p>
              )}
            </div>
          </div>

          <div className="flex gap-1 rounded-lg border bg-muted/30 p-1">
            {(['smtp', 'resend'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setEmailTab(tab)}
                className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  emailTab === tab ? 'bg-white text-slate-900 shadow-sm' : 'text-muted-foreground hover:text-slate-900'
                }`}
              >
                {tab === 'smtp' ? 'SMTP' : 'Resend API'}
              </button>
            ))}
          </div>

          {emailTab === 'smtp' ? (
            <div className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="space-y-2 md:col-span-2">
                  <Label className="text-xs">SMTP host</Label>
                  <Input
                    placeholder="smtp.tuproveedor.com"
                    value={smtpForm.smtpHost}
                    onChange={(e) => setSmtpForm({ ...smtpForm, smtpHost: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Port</Label>
                  <Input
                    placeholder="587 (TLS) / 465 (SSL)"
                    value={smtpForm.smtpPort}
                    onChange={(e) => setSmtpForm({ ...smtpForm, smtpPort: e.target.value })}
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={smtpForm.smtpSecure}
                  onChange={(e) => setSmtpForm({ ...smtpForm, smtpSecure: e.target.checked })}
                  className="h-4 w-4 rounded border-slate-300"
                />
                Use SSL/TLS (secure connection, port 465)
              </label>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label className="text-xs">Username</Label>
                  <Input
                    placeholder="tu@tuproveedor.com"
                    value={smtpForm.smtpUser}
                    onChange={(e) => setSmtpForm({ ...smtpForm, smtpUser: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Password</Label>
                  <Input
                    type="password"
                    placeholder="••••••••"
                    value={smtpForm.smtpPass}
                    onChange={(e) => setSmtpForm({ ...smtpForm, smtpPass: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label className="text-xs">From name (optional)</Label>
                  <Input
                    placeholder="ANYTIMEBOT"
                    value={smtpForm.smtpFromName}
                    onChange={(e) => setSmtpForm({ ...smtpForm, smtpFromName: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">From email (optional)</Label>
                  <Input
                    placeholder="noreply@anytimebot.app"
                    value={smtpForm.smtpFromEmail}
                    onChange={(e) => setSmtpForm({ ...smtpForm, smtpFromEmail: e.target.value })}
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <Label className="text-xs">Resend API key</Label>
              <Input
                type="password"
                placeholder="re_..."
                value={emailApiKey}
                onChange={(e) => setEmailApiKey(e.target.value)}
              />
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={savingEmail} onClick={handleSaveEmail}>
              <KeyRound className="h-4 w-4 mr-1" />
              {savingEmail ? 'Saving...' : 'Save email credentials'}
            </Button>
            {emailStatus?.stored && (
              <Button size="sm" variant="outline" disabled={clearingEmail} onClick={handleClearEmail}>
                <Trash2 className="h-4 w-4 mr-1" />
                Clear
              </Button>
            )}
            {emailStatus?.configured && (
              <div className="flex flex-wrap items-end gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Test recipient (optional)</Label>
                  <Input
                    type="email"
                    placeholder="your@email.com — defaults to admin email"
                    value={testEmailTo}
                    onChange={(e) => setTestEmailTo(e.target.value)}
                    className="w-72"
                  />
                </div>
                <Button size="sm" variant="secondary" disabled={testingEmail} onClick={handleTestEmail}>
                  <Mail className="h-4 w-4 mr-1" />
                  {testingEmail ? 'Sending...' : 'Send test email'}
                </Button>
              </div>
            )}
          </div>

          <p className="text-xs text-muted-foreground">
            SMTP takes precedence when a host is set. To use Resend instead, create an API
            key at resend.com and verify the domain anytimebot.app (add the DNS records
            Resend provides). Emails are sent from
            <code className="mx-1">noreply@anytimebot.app</code> by default.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HardDrive className="h-5 w-5" />
            File storage (MinIO / S3)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Used to host uploaded images (booking-page logos). Point it at any
            S3-compatible service (self-hosted MinIO, AWS S3, …). Saved images are
            served through Anytimebot so the storage can stay private. Configure it
            here without touching environment variables or redeploying.
          </p>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-muted/40 p-3">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-muted-foreground">Status</p>
              {storageStatus ? (
                <p className="text-sm">
                  {storageStatus.configured ? (
                    <span className="text-emerald-600">
                      Configured{' '}
                      ({storageStatus.source === 'database' ? 'stored in database' : 'environment variables'})
                      {storageStatus.bucket ? ` — bucket: ${storageStatus.bucket}` : ''}
                    </span>
                  ) : (
                    <span className="text-amber-600">Not configured — logo uploads are disabled</span>
                  )}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">Checking...</p>
              )}
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2">
              <Label className="text-xs">Endpoint URL</Label>
              <Input
                placeholder="https://minio.example.com"
                value={storageForm.endpoint}
                onChange={(e) => setStorageForm({ ...storageForm, endpoint: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Access key</Label>
              <Input
                placeholder="Access key"
                value={storageForm.accessKey}
                onChange={(e) => setStorageForm({ ...storageForm, accessKey: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Secret key</Label>
              <Input
                type="password"
                placeholder="Leave blank to keep the saved secret"
                value={storageForm.secretKey}
                onChange={(e) => setStorageForm({ ...storageForm, secretKey: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Bucket</Label>
              <Input
                placeholder="anytimebot-uploads"
                value={storageForm.bucket}
                onChange={(e) => setStorageForm({ ...storageForm, bucket: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Region (optional)</Label>
              <Input
                placeholder="us-east-1"
                value={storageForm.region}
                onChange={(e) => setStorageForm({ ...storageForm, region: e.target.value })}
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={storageForm.forcePathStyle}
              onChange={(e) => setStorageForm({ ...storageForm, forcePathStyle: e.target.checked })}
              className="h-4 w-4 rounded border-slate-300"
            />
            Path-style requests (required for MinIO and self-hosted S3)
          </label>

          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={savingStorage} onClick={handleSaveStorage}>
              <KeyRound className="h-4 w-4 mr-1" />
              {savingStorage ? 'Saving...' : 'Save storage credentials'}
            </Button>
            {storageStatus?.configured && (
              <Button size="sm" variant="secondary" disabled={testingStorage} onClick={handleTestStorage}>
                <FlaskConical className="h-4 w-4 mr-1" />
                {testingStorage ? 'Testing...' : 'Test connection'}
              </Button>
            )}
            {storageStatus?.stored && (
              <Button size="sm" variant="outline" disabled={clearingStorage} onClick={handleClearStorage}>
                <Trash2 className="h-4 w-4 mr-1" />
                Clear
              </Button>
            )}
          </div>

          <p className="text-xs text-muted-foreground">
            Env fallbacks: MINIO_ENDPOINT / S3_ENDPOINT, MINIO_ACCESS_KEY, MINIO_SECRET_KEY,
            MINIO_BUCKET, MINIO_REGION and MINIO_FORCE_PATH_STYLE. Stored values take
            precedence. The secret is never returned by the API.
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