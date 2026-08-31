'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Smartphone, Loader2, QrCode, RefreshCw, LogOut, CheckCircle2, XCircle, Trash2, Phone, Save } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

interface QrPayload {
  base64: string;
  code?: string | null;
  pairingCode?: string | null;
}

interface StatusPayload {
  success: boolean;
  connected: boolean;
  state: string;
  hasInstance: boolean;
  configured: boolean;
  phone?: string | null;
  adminPhone?: string | null;
}

const STATUS_LABELS: Record<string, string> = {
  not_configured: 'No conectado',
  not_found: 'Instancia no encontrada',
  open: 'Conectado',
  connected: 'Conectado',
  close: 'Desconectado',
  closed: 'Desconectado',
  error: 'Error de conexión',
  unknown: 'Estado desconocido',
};

export default function AdminWhatsAppPage() {
  const [status, setStatus] = useState<StatusPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [activating, setActivating] = useState(false);
  const [qr, setQr] = useState<QrPayload | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);
  const [adminPhone, setAdminPhone] = useState('');
  const [savingPhone, setSavingPhone] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/whatsapp/status');
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
        if (data.adminPhone) setAdminPhone(data.adminPhone);
        return data as StatusPayload;
      }
    } catch (e) {
      console.error('Failed to fetch WhatsApp status:', e);
    }
    return null;
  }, []);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const startPolling = useCallback(() => {
    stopPolling();
    pollRef.current = setInterval(async () => {
      const s = await fetchStatus();
      if (s?.connected) {
        stopPolling();
        setQr(null);
        toast.success('WhatsApp conectado correctamente');
      }
    }, 4000);
  }, [fetchStatus, stopPolling]);

  const load = useCallback(async () => {
    setLoading(true);
    const s = await fetchStatus();
    if (s?.configured && !s.connected) {
      // Re-fetch QR so the page shows a scannable code when available.
      try {
        const res = await fetch('/api/admin/whatsapp/qr');
        if (res.ok) {
          const data = await res.json();
          setQr(data.qr);
        }
      } catch (e) {
        console.error('Failed to fetch QR:', e);
      }
    }
    setLoading(false);
  }, [fetchStatus]);

  useEffect(() => {
    load();
    return () => stopPolling();
  }, [load, stopPolling]);

  const handleActivate = async () => {
    setActivating(true);
    setQr(null);
    try {
      const res = await fetch('/api/admin/whatsapp/activate', { method: 'POST' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'No se pudo activar WhatsApp');
      }
      const data = await res.json();
      if (data.qr) setQr(data.qr);
      toast.success('WhatsApp activado. Escanea el código con tu teléfono.');
      startPolling();
      await fetchStatus();
    } catch (e) {
      toast.error((e as Error).message || 'No se pudo activar WhatsApp');
    } finally {
      setActivating(false);
    }
  };

  const handleRefreshQr = async () => {
    try {
      const res = await fetch('/api/admin/whatsapp/qr');
      if (res.ok) {
        const data = await res.json();
        setQr(data.qr);
      } else {
        toast.error('No hay código disponible en este momento');
      }
    } catch (e) {
      toast.error('No se pudo obtener el código QR');
    }
  };

  const handleSaveAdminPhone = async () => {
    setSavingPhone(true);
    try {
      const res = await fetch('/api/admin/whatsapp/phone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: adminPhone }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'No se pudo guardar el número');
      }
      toast.success('Número de notificaciones guardado');
    } catch (e) {
      toast.error((e as Error).message || 'No se pudo guardar el número');
    } finally {
      setSavingPhone(false);
    }
  };

  const handleDisconnect = async (permanent: boolean) => {
    setDisconnecting(true);
    try {
      const res = await fetch('/api/admin/whatsapp/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permanent }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'No se pudo desconectar');
      }
      setQr(null);
      stopPolling();
      toast.success(permanent ? 'Conexión eliminada' : 'WhatsApp desconectado');
      await load();
    } catch (e) {
      toast.error((e as Error).message || 'No se pudo desconectar');
    } finally {
      setDisconnecting(false);
    }
  };

  const connected = status?.connected === true;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">WhatsApp de notificaciones</h1>
        <p className="text-muted-foreground">
          Número exclusivo de Anytimebot para confirmaciones, recordatorios de citas y avisos del sistema.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Smartphone className="h-5 w-5" />
            Número de notificaciones del sistema
          </CardTitle>
          <CardDescription>
            Conecta el teléfono desde el que Anytimebot envía confirmaciones y recordatorios cuando el negocio no
            tiene su propio WhatsApp conectado.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {/* Connection status */}
              <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border p-4">
                <div className="flex items-center gap-3">
                  {connected ? (
                    <CheckCircle2 className="h-6 w-6 text-green-600" />
                  ) : (
                    <XCircle className="h-6 w-6 text-gray-400" />
                  )}
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">
                        {connected ? 'Conectado' : STATUS_LABELS[status?.state || 'unknown'] || 'Desconectado'}
                      </span>
                      <Badge className={connected ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}>
                        {connected ? 'Activo' : 'Inactivo'}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {status?.phone
                        ? `Número: ${status.phone}`
                        : status?.configured
                          ? 'Número aún no detectado'
                          : 'Aún no has conectado ningún número'}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {!connected && (
                    <>
                      {!status?.configured ? (
                        <Button onClick={handleActivate} disabled={activating}>
                          {activating ? (
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          ) : (
                            <QrCode className="h-4 w-4 mr-2" />
                          )}
                          Conectar WhatsApp
                        </Button>
                      ) : (
                        <Button variant="outline" onClick={handleRefreshQr}>
                          <RefreshCw className="h-4 w-4 mr-2" />
                          Ver código QR
                        </Button>
                      )}
                    </>
                  )}
                  {connected && (
                    <Button variant="outline" onClick={() => handleDisconnect(false)} disabled={disconnecting}>
                      <LogOut className="h-4 w-4 mr-2" />
                      Desconectar sesión
                    </Button>
                  )}
                  {status?.configured && (
                    <Button variant="destructive" onClick={() => handleDisconnect(true)} disabled={disconnecting}>
                      <Trash2 className="h-4 w-4 mr-2" />
                      Eliminar conexión
                    </Button>
                  )}
                </div>
              </div>

              {/* QR panel */}
              {!connected && qr?.base64 && (
                <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-6">
                  <p className="text-sm font-medium">Escanea este código con WhatsApp de tu teléfono</p>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={qr.base64}
                    alt="Código QR de conexión"
                    className="h-56 w-56 rounded-lg border bg-white p-2"
                  />
                  {qr.pairingCode && (
                    <p className="text-sm text-muted-foreground">
                      Código de emparejamiento: <span className="font-mono font-semibold">{qr.pairingCode}</span>
                    </p>
                  )}
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={handleRefreshQr}>
                      <RefreshCw className="h-4 w-4 mr-1" />
                      Actualizar código
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    El estado se actualiza solo. Cuando escanees el código, la conexión aparecerá como conectada aquí.
                  </p>
                </div>
              )}

              {/* Admin notification number */}
              <div className="rounded-lg border p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Phone className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium">Notificaciones al administrador</p>
                    <p className="text-sm text-muted-foreground">
                      Número que recibe avisos del sistema (p. ej. nuevos registros de usuarios).
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <div className="min-w-[240px] flex-1 max-w-sm">
                    <Label htmlFor="adminPhone" className="sr-only">
                      Número del administrador
                    </Label>
                    <Input
                      id="adminPhone"
                      placeholder="+34 600 111 222"
                      value={adminPhone}
                      onChange={(e) => setAdminPhone(e.target.value)}
                    />
                  </div>
                  <Button variant="outline" onClick={handleSaveAdminPhone} disabled={savingPhone}>
                    <Save className="h-4 w-4 mr-2" />
                    {savingPhone ? 'Guardando…' : 'Guardar'}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Si se deja vacío, se usa el teléfono del perfil del administrador o, en su defecto, el número conectado.
                </p>
              </div>

              {/* Info box */}
              <div className="rounded-lg bg-muted p-4 text-sm text-muted-foreground">
                <p className="font-medium text-foreground mb-1">¿Para qué se usa este número?</p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>Confirmaciones de reserva por WhatsApp a los clientes.</li>
                  <li>Recordatorios de citas (24 horas y 1 hora antes).</li>
                  <li>Encuestas de satisfacción tras la cita.</li>
                  <li>Enviado solo cuando el negocio no tiene su propio WhatsApp conectado.</li>
                </ul>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
