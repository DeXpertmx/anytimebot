'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Loader2, CheckCircle2, XCircle, Trash2, KeyRound, Video } from 'lucide-react';
import { toast } from 'react-hot-toast';

interface DailyConfig {
  connected: boolean;
  domain: string | null;
  updatedAt: string | null;
  platformFallback: boolean;
}

/**
 * Daily video rooms (per-tenant account). The tenant connects its own Daily
 * account so it keeps the 10,000 free participant-minutes every month; Daily
 * bills the tenant directly for anything above that.
 */
export function DailyCard() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [config, setConfig] = useState<DailyConfig | null>(null);
  const [apiKey, setApiKey] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/integrations/daily');
      if (res.ok) {
        setConfig(await res.json());
      } else {
        toast.error('No se pudo cargar la configuración de Daily');
      }
    } catch {
      toast.error('No se pudo cargar la configuración de Daily');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    if (!apiKey.trim()) {
      toast.error('Introduce la API key de tu cuenta de Daily');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/integrations/daily', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: apiKey.trim() }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success('Cuenta de Daily conectada');
        setApiKey('');
        await load();
      } else {
        toast.error(data.error || 'No se pudo guardar la API key');
      }
    } catch {
      toast.error('No se pudo guardar la API key');
    } finally {
      setSaving(false);
    }
  };

  const disconnect = async () => {
    if (!confirm('¿Desconectar tu cuenta de Daily? Las salas nuevas dejarán de crearse.')) return;
    setDisconnecting(true);
    try {
      const res = await fetch('/api/integrations/daily', { method: 'DELETE' });
      if (res.ok) {
        toast.success('Cuenta de Daily desconectada');
        await load();
      } else {
        toast.error('No se pudo desconectar la cuenta');
      }
    } catch {
      toast.error('No se pudo desconectar la cuenta');
    } finally {
      setDisconnecting(false);
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

  const connected = !!config?.connected;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2">
              <Video className="h-5 w-5 text-indigo-600" />
              Salas de vídeo (Daily)
            </CardTitle>
            <CardDescription className="mt-1">
              Tus salas se crean en tu propia cuenta de Daily, con tus 10.000 minutos gratuitos al mes.
            </CardDescription>
          </div>
          {connected ? (
            <Badge className="shrink-0 bg-green-500">
              <CheckCircle2 className="mr-1 h-3 w-3" /> Conectado
            </Badge>
          ) : (
            <Badge variant="secondary" className="shrink-0">
              <XCircle className="mr-1 h-3 w-3" /> No conectado
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {connected && (
          <Alert className="border-blue-200 bg-blue-50">
            <AlertDescription className="text-sm text-blue-800">
              <span className="font-semibold">Dominio:</span> {config?.domain || 'Daily'}
              <br />
              Los primeros 10.000 minutos de participante de cada mes son gratuitos. A partir de ahí,
              Daily te cobra 0,004 $ por minuto a la tarjeta que tengas registrada en tu cuenta.
            </AlertDescription>
          </Alert>
        )}

        <div className="space-y-2">
          <Label htmlFor="daily-api-key">API key de Daily</Label>
          <div className="relative">
            <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="daily-api-key"
              type="password"
              className="pl-9"
              placeholder={
                connected
                  ? '•••••••••••• (guardada) — introduce una nueva para rotarla'
                  : 'Tu API key de Daily'
              }
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Cada cuenta de Daily tiene un dominio y una API key. La clave se guarda en el servidor y
            nunca se envía al navegador.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={save} disabled={saving || !apiKey.trim()}>
            {saving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="mr-2 h-4 w-4" />
            )}
            Guardar API key
          </Button>
          {connected && (
            <Button variant="destructive" onClick={disconnect} disabled={disconnecting}>
              {disconnecting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-2 h-4 w-4" />
              )}
              Desconectar
            </Button>
          )}
        </div>

        {!connected && (
          <Alert className="border-amber-200 bg-amber-50">
            <XCircle className="h-5 w-5 text-amber-600" />
            <AlertDescription className="text-amber-800">
              Para activar las salas de vídeo:
              <ol className="mt-1 list-decimal space-y-1 pl-4">
                <li>Crea una cuenta gratuita en <strong>daily.co</strong> (no hace falta tarjeta para los 10.000 minutos).</li>
                <li>Entra en <strong>dashboard.daily.co → Developers</strong> y copia tu API key.</li>
                <li>Pégala aquí y guarda; validamos la clave contra Daily antes de almacenarla.</li>
              </ol>
              Si pasas de los 10.000 minutos al mes, Daily cobrará el exceso a la tarjeta de tu cuenta.
            </AlertDescription>
          </Alert>
        )}

        {!connected && config?.platformFallback && (
          <Alert className="border-slate-200 bg-slate-50">
            <AlertDescription className="text-xs text-slate-600">
              Mientras no conectes tu cuenta, las salas usan la cuenta de la plataforma. Esa cuenta
              comparte una única bolsa de 10.000 minutos entre todos los clientes, así que conéctala
              para tener tu propia capa gratuita.
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
