'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Loader2, CheckCircle2, XCircle, Database, Trash2, RefreshCw, Send, KeyRound } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface VolkernConfig {
  configured: boolean;
  integration: {
    baseUrl: string;
    username: string;
    hasApiKey: boolean;
    activo: boolean;
    sincronizarCitas: boolean;
    totalCitasSincronizadas: number;
    ultimaSincronizacion: string | null;
  } | null;
  defaultUsername: string;
}

type TestResult = { ok: boolean; text: string };

export function VolkernCard() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<VolkernConfig | null>(null);
  const [baseUrl, setBaseUrl] = useState('https://volkern.app');
  const [apiKey, setApiKey] = useState('');
  const [syncCitas, setSyncCitas] = useState(true);
  const [testing, setTesting] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);

  const showResult = (ok: boolean, text: string) => {
    setResult({ ok, text });
    if (ok) {
      toast({ title: text });
    } else {
      toast({ title: text, variant: 'destructive' });
    }
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/integrations/volkern');
      if (res.ok) {
        const data = await res.json();
        setConfig(data);
        if (data.integration) {
          setBaseUrl(data.integration.baseUrl);
          setSyncCitas(data.integration.sincronizarCitas);
        }
      } else {
        showResult(false, 'No se pudo cargar la configuración de Volkern');
      }
    } catch {
      showResult(false, 'No se pudo cargar la configuración de Volkern');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = async () => {
    if (!apiKey.trim()) {
      showResult(false, 'Introduce la API key de tu cuenta de Volkern');
      return;
    }
    setSaving(true);
    setResult(null);
    try {
      const res = await fetch('/api/integrations/volkern', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          baseUrl,
          apiKey: apiKey.trim(),
          activo: true,
          sincronizarCitas: syncCitas,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showResult(true, 'Integración con Volkern CRM guardada');
        setApiKey('');
        await load();
      } else {
        showResult(false, data.error || 'Error al guardar la configuración');
      }
    } catch {
      showResult(false, 'Error al guardar la configuración');
    } finally {
      setSaving(false);
    }
  };

  const disconnect = async () => {
    if (!confirm('¿Desconectar la integración con Volkern CRM?')) return;
    try {
      const res = await fetch('/api/integrations/volkern', { method: 'DELETE' });
      if (res.ok) {
        showResult(true, 'Integración desconectada');
        setConfig(null);
        setBaseUrl('https://volkern.app');
        setApiKey('');
        setResult(null);
      } else {
        showResult(false, 'Error al desconectar la integración');
      }
    } catch {
      showResult(false, 'Error al desconectar la integración');
    }
  };

  const testConnection = async () => {
    setTesting(true);
    setResult(null);
    try {
      const res = await fetch('/api/integrations/volkern/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'ping' }),
      });
      const data = await res.json();
      const text =
        data.message ||
        (res.ok
          ? 'Conexión correcta: tu instancia de Volkern responde.'
          : data.error || `La instancia de Volkern respondió con estado ${data.status}`);
      showResult(res.ok && data.success !== false, text);
    } catch {
      showResult(false, 'No se pudo alcanzar la instancia de Volkern');
    } finally {
      setTesting(false);
    }
  };

  const validateApiKey = async () => {
    setSendingTest(true);
    setResult(null);
    try {
      const res = await fetch('/api/integrations/volkern/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'key' }),
      });
      const data = await res.json();
      const ok = res.ok && data.success;
      const text = data.message || data.error || 'Error al validar la API key';
      showResult(ok, ok && data.durationMs ? `${text} (HTTP ${data.status} en ${data.durationMs}ms)` : text);
    } catch {
      showResult(false, 'Error al validar la API key');
    } finally {
      setSendingTest(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8 text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Cargando…
        </CardContent>
      </Card>
    );
  }

  const connected = !!config?.integration?.hasApiKey;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
              <Database className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="flex items-center gap-2">
                Volkern CRM
                {connected ? (
                  <Badge variant="default" className="bg-green-500">
                    <CheckCircle2 className="mr-1 h-3 w-3" /> Conectado
                  </Badge>
                ) : (
                  <Badge variant="secondary">No configurado</Badge>
                )}
              </CardTitle>
              <CardDescription>
                Sincroniza tus reservas con tu CRM Volkern (API REST)
              </CardDescription>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {connected && config?.integration && (
          <Alert className="border-blue-200 bg-blue-50">
            <AlertDescription className="text-sm text-blue-800">
              <div className="flex flex-wrap gap-x-6 gap-y-1">
                <span><strong>Reservas sincronizadas:</strong> {config.integration.totalCitasSincronizadas}</span>
                {config.integration.ultimaSincronizacion && (
                  <span><strong>Última sincronización:</strong> {new Date(config.integration.ultimaSincronizacion).toLocaleString()}</span>
                )}
              </div>
            </AlertDescription>
          </Alert>
        )}

        <div className="space-y-2">
          <Label htmlFor="volkern-url">URL de Volkern CRM</Label>
          <Input
            id="volkern-url"
            placeholder="https://volkern.app"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Instancia de Volkern a la que se enviarán las reservas.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="volkern-apikey">API key de Volkern</Label>
          <div className="relative">
            <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="volkern-apikey"
              type="password"
              className="pl-9"
              placeholder={connected ? '•••••••••••• (guardada) — introduce una nueva para rotarla' : 'vk_prod_…'}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Cada reserva se crea en <strong>tu propio tenant</strong> de Volkern usando esta API key.
            Genérala en tu cuenta Volkern: <strong>Configuración → API</strong> (permisos de leads y citas).
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={syncCitas}
              onChange={(e) => setSyncCitas(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300"
            />
            Sincronizar reservas (crear/cancelar/reprogramar citas)
          </label>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={save} disabled={saving || !baseUrl || !apiKey.trim()}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
            Guardar API key
          </Button>
          <Button variant="outline" onClick={testConnection} disabled={testing || sendingTest}>
            {testing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Probar Conexión
          </Button>
          {connected && (
            <Button variant="outline" onClick={validateApiKey} disabled={sendingTest || testing}>
              {sendingTest ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
              Validar API key
            </Button>
          )}
          {connected && (
            <Button variant="destructive" onClick={disconnect}>
              <Trash2 className="mr-2 h-4 w-4" />
              Desconectar
            </Button>
          )}
        </div>

        {result && (
          <Alert className={result.ok ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}>
            {result.ok ? (
              <CheckCircle2 className="h-5 w-5 text-green-600" />
            ) : (
              <XCircle className="h-5 w-5 text-red-600" />
            )}
            <AlertDescription className={`text-sm ${result.ok ? 'text-green-800' : 'text-red-800'}`}>
              {result.text}
            </AlertDescription>
          </Alert>
        )}

        {!connected && (
          <Alert className="border-amber-200 bg-amber-50">
            <XCircle className="h-5 w-5 text-amber-600" />
            <AlertDescription className="text-amber-800">
              Para activar la sincronización de reservas:
              <ol className="mt-1 list-decimal space-y-1 pl-4">
                <li>Inicia sesión en tu cuenta de Volkern.</li>
                <li>Ve a <strong>Configuración → API</strong> y crea una API key con permisos de <em>leads</em> y <em>citas</em>.</li>
                <li>Pega aquí la API key (empieza por <code>vk_…</code>) y guarda.</li>
              </ol>
              Las reservas nuevas, cancelaciones y reprogramaciones se sincronizarán con tu tenant de Volkern.
            </AlertDescription>
          </Alert>
        )}

        {connected && (
          <Alert className="border-slate-200 bg-slate-50">
            <AlertDescription className="text-xs text-slate-600">
              La sincronización de mensajes del bot está pausada: la API pública de Volkern aún no expone un
              endpoint para crear mensajes. Cuando esté disponible se reactivará automáticamente.
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
