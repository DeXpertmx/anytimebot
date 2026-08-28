'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Loader2, CheckCircle2, XCircle, MessageCircle, QrCode, RefreshCw, Trash2, Zap } from 'lucide-react';
import { toast } from 'react-hot-toast';

type ConnStatus = 'not_created' | 'connecting' | 'connected' | 'error' | 'loading';

export default function IntegrationsPage() {
  const { data: session } = useSession() || {};
  const [activating, setActivating] = useState(false);
  const [statusLoading, setStatusLoading] = useState(false);
  const [qrLoading, setQrLoading] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const [status, setStatus] = useState<ConnStatus>('loading');
  const [stateLabel, setStateLabel] = useState('');
  const [qr, setQr] = useState<string | null>(null);
  const [showingQr, setShowingQr] = useState(false);
  const [instanceName, setInstanceName] = useState('');

  // Twilio state (kept as-is)
  const [activeProvider, setActiveProvider] = useState<'whatsapp' | 'twilio'>('whatsapp');
  const [twilioConfig, setTwilioConfig] = useState({ accountSid: '', authToken: '', phoneNumber: '' });
  const [twilioStatus, setTwilioStatus] = useState<'connected' | 'disconnected' | 'unknown'>('unknown');
  const [twilioKey, setTwilioKey] = useState(0);

  const checkStatus = useCallback(async () => {
    setStatusLoading(true);
    try {
      const res = await fetch('/api/whatsapp/status');
      if (res.ok) {
        const data = await res.json();
        if (!data.success || !data.hasInstance) {
          setStatus(data.hasInstance ? 'error' : 'not_created');
          setStateLabel('');
          setShowingQr(false);
        } else if (data.connected) {
          setStatus('connected');
          setStateLabel(data.state || 'open');
          setShowingQr(false);
        } else {
          setStatus('connecting');
          setStateLabel(data.state || 'connecting');
        }
      } else {
        setStatus('error');
      }
    } catch {
      setStatus('error');
    } finally {
      setStatusLoading(false);
    }
  }, []);

  useEffect(() => {
    void checkStatus();
  }, [checkStatus]);

  const handleActivate = async () => {
    setActivating(true);
    try {
      const res = await fetch('/api/whatsapp/activate', { method: 'POST' });
      const data = await res.json();
      if (!res.ok || !data.success) {
        toast.error(data.error || 'No se pudo activar WhatsApp');
        return;
      }
      if (data.instanceName) setInstanceName(data.instanceName);
      toast.success('WhatsApp activado. Escanea el código QR para conectar tu teléfono.');
      if (data.qr?.base64) {
        setQr(data.qr.base64);
        setShowingQr(true);
      }
      await checkStatus();
    } catch (e) {
      toast.error('Error al activar WhatsApp');
    } finally {
      setActivating(false);
    }
  };

  const fetchQr = async () => {
    setQrLoading(true);
    try {
      const res = await fetch('/api/whatsapp/qr');
      const data = await res.json();
      if (res.ok && data.qr?.base64) {
        setQr(data.qr.base64);
        setShowingQr(true);
      } else {
        toast.success('Abre WhatsApp en tu teléfono y escanea el código.');
        // Fall back: keep QR area open but empty; status will surface once paired.
        setShowingQr(true);
      }
    } catch {
      toast.error('No se pudo obtener el código QR');
    } finally {
      setQrLoading(false);
    }
  };

  const handleShowQr = async () => {
    if (showingQr) {
      setShowingQr(false);
      return;
    }
    await fetchQr();
  };

  const handleDisconnect = async () => {
    if (!confirm('¿Desconectar WhatsApp de este dispositivo?')) return;
    setDisconnecting(true);
    try {
      const res = await fetch('/api/whatsapp/disconnect', { method: 'POST', body: JSON.stringify({ permanent: true }) });
      if (res.ok) {
        toast.success('WhatsApp desconectado');
        setQr(null);
        setShowingQr(false);
        setInstanceName('');
        await checkStatus();
      } else {
        const data = await res.json();
        toast.error(data.error || 'Error al desconectar');
      }
    } catch {
      toast.error('Error al desconectar');
    } finally {
      setDisconnecting(false);
    }
  };

  const statusBadge = () => {
    if (statusLoading) {
      return <Badge variant="secondary"><Loader2 className="mr-1 h-3 w-3 animate-spin" />Verificando…</Badge>;
    }
    if (status === 'connected') {
      return <Badge variant="default" className="bg-green-500"><CheckCircle2 className="mr-1 h-3 w-3" />Conectado</Badge>;
    }
    if (status === 'connecting') {
      return <Badge variant="secondary" className="bg-amber-100 text-amber-800"><Loader2 className="mr-1 h-3 w-3 animate-spin" />Pendiente de escaneo</Badge>;
    }
    if (status === 'error') {
      return <Badge variant="destructive"><XCircle className="mr-1 h-3 w-3" />Error</Badge>;
    }
    return <Badge variant="secondary">No conectado</Badge>;
  };

  // --- Twilio handlers (unchanged from previous behaviour) --------------
  const loadTwilio = async () => {
    try {
      const res = await fetch('/api/integrations/twilio/config');
      if (res.ok) {
        const d = await res.json();
        setTwilioConfig({ accountSid: d.accountSid || '', authToken: '', phoneNumber: d.phoneNumber || '' });
        setTwilioStatus(d.hasAuthToken ? 'connected' : 'disconnected');
        setActiveProvider(d.provider ? (d.provider === 'twilio' ? 'twilio' : 'whatsapp') : 'whatsapp');
      }
    } catch (e) {
      /* ignore */
    }
  };
  useEffect(() => { void loadTwilio(); }, [twilioKey]);

  const saveTwilio = async () => {
    try {
      const res = await fetch('/api/integrations/twilio/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...twilioConfig, provider: 'twilio' }),
      });
      if (res.ok) {
        toast.success('Twilio configurado');
        setTwilioStatus('connected');
        setActiveProvider('twilio');
      } else {
        const e = await res.json();
        toast.error(e.error || 'Error al guardar');
      }
    } catch {
      toast.error('Error al guardar Twilio');
    }
  };

  const disconnectTwilio = async () => {
    if (!confirm('¿Desconectar Twilio?')) return;
    try {
      const res = await fetch('/api/integrations/twilio/config', { method: 'DELETE' });
      if (res.ok) {
        toast.success('Twilio desconectado');
        setTwilioConfig({ accountSid: '', authToken: '', phoneNumber: '' });
        setTwilioStatus('disconnected');
      }
    } catch {
      toast.error('Error al desconectar');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Integraciones de mensajería</h1>
        <p className="text-muted-foreground">
          Conecta tu número de WhatsApp para enviar y recibir mensajes desde tu plataforma
        </p>
      </div>

      <Alert>
        <MessageCircle className="h-4 w-4" />
        <AlertDescription className="flex items-center gap-2">
          Mensajería activa:&nbsp;
          <Badge variant="default" className="ml-1">
            {activeProvider === 'whatsapp' ? 'WhatsApp' : 'Twilio'}
          </Badge>
        </AlertDescription>
      </Alert>

      <Tabs value={activeProvider} onValueChange={(v) => setActiveProvider(v as any)} className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="whatsapp" className="flex items-center gap-2">
            <MessageCircle className="h-4 w-4" />
            WhatsApp
            {status === 'connected' && <CheckCircle2 className="h-3 w-3 text-green-500" />}
          </TabsTrigger>
          <TabsTrigger value="twilio" className="flex items-center gap-2">
            <Zap className="h-4 w-4" />
            Twilio
            {twilioStatus === 'connected' && <CheckCircle2 className="h-3 w-3 text-green-500" />}
          </TabsTrigger>
        </TabsList>

        {/* WhatsApp tab */}
        <TabsContent value="whatsapp">
          <Card>
            <CardHeader className="flex flex-row items-start justify-between space-y-0">
              <div>
                <CardTitle>WhatsApp</CardTitle>
                <CardDescription>
                  Activa la conexión para recibir y responder mensajes al instante. Sin configuración manual.
                </CardDescription>
              </div>
              {statusBadge()}
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Not created: show activate button */}
              {(status === 'not_created' || status === 'error') && (
                <div className="space-y-4">
                  <Alert>
                    <AlertDescription>
                      Al activar, la plataforma crea automáticamente tu conexión y te muestra un código QR para
                      vincular tu teléfono. No necesitas instalar ni configurar nada manualmente.
                    </AlertDescription>
                  </Alert>
                  <div className="flex flex-wrap gap-3">
                    <Button onClick={handleActivate} disabled={activating}>
                      {activating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      Activar WhatsApp
                    </Button>
                    <Button variant="outline" onClick={checkStatus} disabled={statusLoading}>
                      <RefreshCw className="mr-2 h-4 w-4" />
                      Verificar estado
                    </Button>
                  </div>
                </div>
              )}

              {/* Connecting / connected / QR area */}
              {(status === 'connecting' || status === 'connected') && (
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    {status === 'connected' ? (
                      <CheckCircle2 className="h-5 w-5 text-green-500" />
                    ) : (
                      <Loader2 className="h-5 w-5 animate-spin text-amber-500" />
                    )}
                    <p className="text-sm text-muted-foreground">
                      {status === 'connected'
                        ? 'Tu número está vinculado. Los mensajes entrantes se procesan automáticamente.'
                        : 'Escanea el código QR para vincular tu teléfono.'}
                    </p>
                  </div>

                  {/* QR card */}
                  <Card>
                    <CardContent className="flex flex-col items-center gap-3 pt-6">
                      {showingQr && qr ? (
                        <>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={qr} alt="Código QR de WhatsApp" className="h-56 w-56 object-contain rounded-lg border" />
                          <p className="text-xs text-muted-foreground text-center">
                            Abre WhatsApp en tu teléfono → Ajustes → Dispositivos vinculados → Vincular un dispositivo y escanea.
                          </p>
                        </>
                      ) : status === 'connected' ? (
                        <p className="text-sm text-green-700">Conectado correctamente.</p>
                      ) : (
                        <p className="text-xs text-muted-foreground text-center">
                          Presiona &quot;Mostrar código QR&quot; para vincular tu teléfono.
                        </p>
                      )}

                      <div className="flex flex-wrap justify-center gap-2">
                        <Button variant="outline" onClick={handleShowQr} disabled={qrLoading}>
                          {qrLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <QrCode className="mr-2 h-4 w-4" />}
                          {showingQr ? 'Ocultar código' : 'Mostrar código QR'}
                        </Button>
                        {status !== 'connected' && (
                          <Button variant="outline" onClick={fetchQr} disabled={qrLoading}>
                            <RefreshCw className="mr-2 h-4 w-4" />
                            Actualizar QR
                          </Button>
                        )}
                        <Button variant="destructive" onClick={handleDisconnect} disabled={disconnecting}>
                          {disconnecting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                          Desconectar
                        </Button>
                      </div>
                    </CardContent>
                  </Card>

                  {instanceName && (
                    <Alert>
                      <AlertDescription className="text-xs text-muted-foreground font-mono break-all">
                        Conexión: {instanceName}
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Twilio tab */}
        <TabsContent value="twilio">
          <Card>
            <CardHeader>
              <CardTitle>Twilio WhatsApp</CardTitle>
              <CardDescription>Configura tu cuenta de Twilio para mensajería a escala</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="twilio-sid">Account SID</Label>
                <Input id="twilio-sid" placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" value={twilioConfig.accountSid}
                  onChange={(e) => setTwilioConfig({ ...twilioConfig, accountSid: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="twilio-token">Auth Token</Label>
                <Input id="twilio-token" type="password" placeholder="Tu Twilio Auth Token" value={twilioConfig.authToken}
                  onChange={(e) => setTwilioConfig({ ...twilioConfig, authToken: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="twilio-phone">Número de WhatsApp</Label>
                <Input id="twilio-phone" placeholder="+14155238886" value={twilioConfig.phoneNumber}
                  onChange={(e) => setTwilioConfig({ ...twilioConfig, phoneNumber: e.target.value })} />
              </div>
              <div className="flex gap-2">
                <Button onClick={saveTwilio} disabled={!twilioConfig.accountSid || !twilioConfig.authToken}>
                  Guardar Configuración
                </Button>
                {twilioStatus === 'connected' && (
                  <Button variant="destructive" onClick={disconnectTwilio}>Desconectar</Button>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}