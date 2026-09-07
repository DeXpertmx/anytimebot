'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Loader2, CheckCircle2, XCircle, Database, Trash2, RefreshCw, Send } from 'lucide-react';
import { toast } from 'react-hot-toast';

interface VolkernConfig {
  configured: boolean;
  integration: {
    baseUrl: string;
    username: string;
    hasWebhookSecret: boolean;
    activo: boolean;
    sincronizarCitas: boolean;
    sincronizarMensajes: boolean;
    totalCitasSincronizadas: number;
    totalMensajesSincronizados: number;
    ultimaSincronizacion: string | null;
  } | null;
  defaultUsername: string;
}

export function VolkernCard() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<VolkernConfig | null>(null);
  const [baseUrl, setBaseUrl] = useState('https://volkern.app');
  const [username, setUsername] = useState('');
  const [webhookSecret, setWebhookSecret] = useState('');
  const [syncCitas, setSyncCitas] = useState(true);
  const [syncMensajes, setSyncMensajes] = useState(true);
  const [testing, setTesting] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/integrations/volkern');
      if (res.ok) {
        const data = await res.json();
        setConfig(data);
        if (data.integration) {
          setBaseUrl(data.integration.baseUrl);
          setUsername(data.integration.username);
          setSyncCitas(data.integration.sincronizarCitas);
          setSyncMensajes(data.integration.sincronizarMensajes);
        } else {
          setUsername(data.defaultUsername || '');
        }
      }
    } catch {
      toast.error('No se pudo cargar la configuración de Volkern');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/integrations/volkern', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          baseUrl,
          username,
          webhookSecret: webhookSecret || undefined,
          activo: true,
          sincronizarCitas: syncCitas,
          sincronizarMensajes: syncMensajes,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success('Integración con Volkern CRM guardada');
        setWebhookSecret('');
        await load();
      } else {
        toast.error(data.error || 'Error al guardar');
      }
    } catch {
      toast.error('Error al guardar la configuración');
    } finally {
      setSaving(false);
    }
  };

  const disconnect = async () => {
    if (!confirm('¿Desconectar la integración con Volkern CRM?')) return;
    try {
      const res = await fetch('/api/integrations/volkern', { method: 'DELETE' });
      if (res.ok) {
        toast.success('Integración desconectada');
        setConfig(null);
        setBaseUrl('https://volkern.app');
        setUsername('');
        setWebhookSecret('');
      }
    } catch {
      toast.error('Error al desconectar');
    }
  };

  const testConnection = async () => {
    setTesting(true);
    try {
      // The Volkern webhook receiver answers 200 on a GET, so a reachability
      // check confirms the URL is live without creating any records.
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10_000);
      const res = await fetch(`${baseUrl.replace(/\/$/, '')}/api/webhooks/anytimebot`, {
        method: 'GET',
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (res.ok) {
        toast.success('Volkern CRM responde correctamente');
      } else {
        toast.error(`Volkern respondió con estado ${res.status}`);
      }
    } catch {
      toast.error('No se pudo alcanzar la URL de Volkern');
    } finally {
      setTesting(false);
    }
  };

  const sendTestEvent = async () => {
    setSendingTest(true);
    try {
      const res = await fetch('/api/integrations/volkern/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(
          `Evento de prueba recibido (HTTP ${data.status} en ${data.durationMs}ms)` +
            (data.signed ? ' con firma HMAC válida' : ' (sin secret configurado)'),
        );
      } else {
        toast.error(
          data.error ||
            (data.status ? `Volkern respondió con estado ${data.status}` : 'Error al enviar el evento de prueba'),
        );
      }
    } catch {
      toast.error('Error al enviar el evento de prueba');
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

  const connected = !!config?.integration;

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
                Sincroniza reservas y mensajes del bot con tu CRM Volkern
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
                <span><strong>Citas sincronizadas:</strong> {config.integration.totalCitasSincronizadas}</span>
                <span><strong>Mensajes sincronizados:</strong> {config.integration.totalMensajesSincronizados}</span>
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
            Instancia de Volkern a la que se enviarán las reservas y mensajes.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="volkern-username">Username de Anytimebot</Label>
          <Input
            id="volkern-username"
            placeholder="tu-usuario"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            El username con el que Volkern identifica tu cuenta. Se envía en cada webhook.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="volkern-secret">Webhook Secret (opcional)</Label>
          <Input
            id="volkern-secret"
            type="password"
            placeholder={config?.integration?.hasWebhookSecret ? '•••••••• (guardado)' : 'Secret compartido con Volkern'}
            value={webhookSecret}
            onChange={(e) => setWebhookSecret(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Firma HMAC de los webhooks. Debe coincidir con el configurado en Volkern (Integraciones → Anytimebot).
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
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={syncMensajes}
              onChange={(e) => setSyncMensajes(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300"
            />
            Sincronizar mensajes del bot
          </label>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={save} disabled={saving || !baseUrl || !username}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
            Guardar Configuración
          </Button>
          <Button variant="outline" onClick={testConnection} disabled={testing || !baseUrl}>
            {testing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Probar Conexión
          </Button>
          {connected && (
            <Button variant="outline" onClick={sendTestEvent} disabled={sendingTest || !baseUrl}>
              {sendingTest ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
              Enviar Evento de Prueba
            </Button>
          )}
          {connected && (
            <Button variant="destructive" onClick={disconnect}>
              <Trash2 className="mr-2 h-4 w-4" />
              Desconectar
            </Button>
          )}
        </div>

        {!connected && (
          <Alert className="border-amber-200 bg-amber-50">
            <XCircle className="h-5 w-5 text-amber-600" />
            <AlertDescription className="text-amber-800">
              Para activar la sincronización: crea la integración en Volkern (Integraciones → Anytimebot) con tu
              username y el mismo webhook secret, y configura la URL de tu instancia aquí. Las reservas y
              conversaciones del bot se sincronizarán automáticamente.
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}