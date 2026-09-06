'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, Loader2, MonitorPlay, Unplug, Video, XCircle } from 'lucide-react';
import { toast } from 'react-hot-toast';

type VideoStatus = {
  connected: boolean;
  accountEmail?: string;
  accountDisplayName?: string;
  error?: string;
};

/**
 * Zoom / Microsoft Teams connections (per-tenant OAuth). Shows the connected
 * account and lets the tenant connect/disconnect from Integraciones.
 */
export function VideoConnections() {
  const [zoom, setZoom] = useState<VideoStatus | null>(null);
  const [teams, setTeams] = useState<VideoStatus | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/integrations/video/status');
      if (!res.ok) return;
      const data = await res.json();
      if (data.success) {
        setZoom(data.data.zoom);
        setTeams(data.data.teams);
      }
    } catch {
      /* ignore transient errors */
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const connect = (provider: 'zoom' | 'teams') => {
    window.location.href = `/api/integrations/${provider}/connect`;
  };

  const disconnect = async (provider: 'zoom' | 'teams') => {
    if (!window.confirm(`¿Desconectar ${provider === 'zoom' ? 'Zoom' : 'Microsoft Teams'}?`)) return;
    setBusy(provider);
    try {
      const res = await fetch(`/api/integrations/${provider}/disconnect`, { method: 'POST' });
      if (res.ok) {
        toast.success(`${provider === 'zoom' ? 'Zoom' : 'Microsoft Teams'} desconectado`);
        await load();
      } else {
        toast.error('No se pudo desconectar');
      }
    } catch {
      toast.error('Error al desconectar');
    } finally {
      setBusy(null);
    }
  };

  const renderCard = (
    provider: 'zoom' | 'teams',
    label: string,
    status: VideoStatus | null,
    hint: string
  ) => (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2">
              <Video className="h-5 w-5 text-indigo-600" />
              {label}
            </CardTitle>
            <CardDescription className="mt-1">{hint}</CardDescription>
          </div>
          {status?.connected ? (
            <Badge className="shrink-0 bg-green-500">
              <CheckCircle2 className="mr-1 h-3 w-3" />
              Conectado
            </Badge>
          ) : (
            <Badge variant="secondary" className="shrink-0">
              <XCircle className="mr-1 h-3 w-3" />
              No conectado
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {status?.connected ? (
          <>
            <div className="text-sm text-gray-700">
              <p className="font-medium">{status.accountDisplayName || label}</p>
              {status.accountEmail && (
                <p className="text-muted-foreground">{status.accountEmail}</p>
              )}
            </div>
            <Button
              variant="destructive"
              onClick={() => disconnect(provider)}
              disabled={busy === provider}
            >
              {busy === provider ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Unplug className="mr-2 h-4 w-4" />
              )}
              Desconectar
            </Button>
          </>
        ) : (
          <>
            {status?.error === 'not_configured' && (
              <p className="text-xs text-amber-600">
                La integración aún no está configurada en la plataforma. Contacta con soporte.
              </p>
            )}
            <Button onClick={() => connect(provider)}>
              <MonitorPlay className="mr-2 h-4 w-4" />
              Conectar {label}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {renderCard(
        'zoom',
        'Zoom',
        zoom,
        'Crea reuniones automáticamente con tu cuenta de Zoom al reservar un evento de videollamada.'
      )}
      {renderCard(
        'teams',
        'Microsoft Teams',
        teams,
        'Crea reuniones automáticamente con tu cuenta de Microsoft Teams al reservar un evento de videollamada.'
      )}
    </div>
  );
}