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
import {
  Loader2, CheckCircle2, XCircle, MessageCircle, QrCode, RefreshCw, Trash2, Zap,
  Smartphone, Bot, ShieldCheck, Sparkles, ClipboardList, Phone, CreditCard,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { StripeConnectCard } from '@/components/dashboard/settings/stripe-connect-card';

type ConnStatus = 'not_created' | 'connecting' | 'connected' | 'error' | 'loading';

export default function IntegrationsPage() {
  const { data: session } = useSession() || {};
  const [activating, setActivating] = useState(false);
  const [statusLoading, setStatusLoading] = useState(false);
  const [qrLoading, setQrLoading] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const [status, setStatus] = useState<ConnStatus>('loading');
  const [stateLabel, setStateLabel] = useState('');
  const [phone, setPhone] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [showingQr, setShowingQr] = useState(false);

  // Twilio state (kept as-is)
  const [activeProvider, setActiveProvider] = useState<'whatsapp' | 'twilio' | 'payments'>('whatsapp');
  const [twilioConfig, setTwilioConfig] = useState({ accountSid: '', authToken: '', phoneNumber: '' });
  const [twilioStatus, setTwilioStatus] = useState<'connected' | 'disconnected' | 'unknown'>('unknown');
  const [twilioKey, setTwilioKey] = useState(0);

  const checkStatus = useCallback(async () => {
    setStatusLoading(true);
    try {
      const res = await fetch('/api/whatsapp/status');
      if (res.ok) {
        const data = await res.json();
        setPhone(data.phone || null);
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

  // The pairing service updates asynchronously after the QR is scanned.
  // Poll while pairing so the UI reflects the server state without requiring
  // the user to refresh the page manually.
  useEffect(() => {
    if (status !== 'connecting') return;
    const timer = window.setInterval(() => {
      void checkStatus();
    }, 3000);
    return () => window.clearInterval(timer);
  }, [status, checkStatus]);

  const handleActivate = async () => {
    setActivating(true);
    try {
      const res = await fetch('/api/whatsapp/activate', { method: 'POST' });
      const data = await res.json();
      if (!res.ok || !data.success) {
        toast.error(data.error || 'No se pudo activar WhatsApp');
        return;
      }
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
        setPhone(null);
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
      return <Badge variant="secondary" className="border-amber-300 bg-amber-50 text-amber-800"><Loader2 className="mr-1 h-3 w-3 animate-spin" />Conectando…</Badge>;
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

  const howItWorks = [
    'Pulsa "Crear y conectar WhatsApp del Negocio"',
    'La plataforma crea la conexión del negocio y configura el webhook',
    'Escanea el código QR con el teléfono del negocio',
    'Espera a que el estado cambie a conectado',
    '¡Listo! El chatbot empieza a responder desde este número',
  ];

  const requirements = [
    'El servicio de WhatsApp debe estar disponible para la plataforma',
    'Un teléfono con WhatsApp para escanear el QR',
    'No tener otro WhatsApp del negocio activo en esta cuenta',
  ];

  const benefits = [
    'El chatbot tiene una identidad propia (la del negocio)',
    'El cliente nunca ve números personales',
    'Las escalaciones se atienden en el centro de comunicaciones con el mismo número',
    'Todas las conversaciones de trabajo quedan registradas',
  ];

  return (
    <div className="min-w-0 space-y-6 pb-8">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-indigo-600 p-2.5 text-white">
          <Smartphone className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">WhatsApp del Negocio</h1>
          <p className="text-muted-foreground">
            Número dedicado del negocio para el chatbot y el equipo. Separado de los WhatsApp personales.
          </p>
        </div>
      </div>

      {/* Conexión automática */}
      <Alert className="border-green-200 bg-green-50">
        <CheckCircle2 className="h-5 w-5 text-green-600" />
        <AlertDescription className="text-green-800">
          <span className="font-semibold">Conexión automática:</span> La plataforma crea la conexión del negocio y
          mostrará aquí el código QR para vincular el número. Solo puede existir un WhatsApp del negocio por cuenta.
        </AlertDescription>
      </Alert>

      {/* Responden desde este número */}
      <Alert className="border-blue-200 bg-blue-50">
        <Bot className="h-5 w-5 text-blue-600" />
        <AlertDescription className="text-blue-800">
          El chatbot responde desde este número. Cuando una conversación se escala a un agente, este la atiende desde el
          centro de comunicaciones usando el mismo número del negocio: el cliente nunca ve números personales y todas
          las conversaciones quedan registradas.
        </AlertDescription>
      </Alert>

      <Tabs value={activeProvider} onValueChange={(v) => setActiveProvider(v as any)} className="w-full">
        <TabsList className="grid w-full max-w-lg grid-cols-3">
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
          <TabsTrigger value="payments" className="flex items-center gap-2">
            <CreditCard className="h-4 w-4" />
            Pagos y Cobros
          </TabsTrigger>
        </TabsList>

        {/* WhatsApp tab */}
        <TabsContent value="whatsapp">
          {/* Not created / error: onboarding card */}
          {(status === 'not_created' || status === 'error') && (
            <Card>
              <CardContent className="flex flex-col items-center gap-6 pt-8 text-center">
                <div className="flex w-full flex-col items-center gap-3">
                  <h2 className="text-xl font-bold">Conecta el WhatsApp del Negocio</h2>
                  <p className="max-w-md text-sm text-muted-foreground">
                    Un número dedicado del negocio para el chatbot y las conversaciones de trabajo.
                  </p>
                </div>

                {status === 'error' && (
                  <Alert variant="destructive" className="w-full">
                    <AlertDescription>No pudimos verificar el estado de la conexión. Inténtalo de nuevo.</AlertDescription>
                  </Alert>
                )}

                {/* ¿Cómo funciona? */}
                <div className="w-full rounded-xl bg-gray-50 p-5 text-left">
                  <h3 className="mb-3 flex items-center gap-2 text-sm font-bold">
                    <ClipboardList className="h-4 w-4 text-indigo-600" /> ¿Cómo funciona?
                  </h3>
                  <ol className="space-y-2">
                    {howItWorks.map((step, i) => (
                      <li key={i} className="flex items-start gap-3 text-sm text-gray-700">
                        <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-semibold text-indigo-700">
                          {i + 1}
                        </span>
                        {step}
                      </li>
                    ))}
                  </ol>
                </div>

                {/* Requisitos */}
                <div className="w-full rounded-xl border border-blue-200 bg-blue-50 p-5 text-left">
                  <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-blue-800">
                    <ShieldCheck className="h-4 w-4" /> Requisitos previos:
                  </h3>
                  <ul className="space-y-1.5">
                    {requirements.map((r, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-blue-800">
                        <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-blue-500" />
                        {r}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Beneficios */}
                <div className="w-full rounded-xl border border-green-200 bg-green-50 p-5 text-left">
                  <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-green-800">
                    <Sparkles className="h-4 w-4" /> Beneficios:
                  </h3>
                  <ul className="space-y-1.5">
                    {benefits.map((b, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-green-800">
                        <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-green-600" />
                        {b}
                      </li>
                    ))}
                  </ul>
                </div>

                <Button
                  onClick={handleActivate}
                  disabled={activating}
                  className="h-12 w-full px-6 py-3 text-base"
                >
                  {activating ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Phone className="mr-2 h-5 w-5" />}
                  Crear y conectar WhatsApp del Negocio
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Connecting / connected: status card */}
          {(status === 'connecting' || status === 'connected') && (
            <div className="space-y-4">
              <Card>
                <CardHeader className="flex flex-row items-start justify-between space-y-0">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-full bg-indigo-50 text-indigo-600">
                      <MessageCircle className="h-5 w-5" />
                    </div>
                    <div>
                      <CardTitle>WhatsApp del Negocio</CardTitle>
                      <CardDescription>
                        {phone ? phone : status === 'connected' ? 'Número vinculado' : 'Número no disponible'}
                      </CardDescription>
                    </div>
                  </div>
                  {statusBadge()}
                </CardHeader>
                <CardContent>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-lg bg-gray-50 p-4 text-center">
                      <MessageCircle className="mx-auto mb-1 h-5 w-5 text-muted-foreground" />
                      <p className="text-xs text-muted-foreground">Mensajes</p>
                      <p className="text-xl font-bold">0</p>
                    </div>
                    <div className="rounded-lg bg-gray-50 p-4 text-center">
                      <Phone className="mx-auto mb-1 h-5 w-5 text-muted-foreground" />
                      <p className="text-xs text-muted-foreground">Estado</p>
                      <p className="text-xl font-bold">{status === 'connected' ? 'Activo' : 'Inactivo'}</p>
                    </div>
                    <div className="rounded-lg bg-gray-50 p-4 text-center">
                      <Sparkles className="mx-auto mb-1 h-5 w-5 text-muted-foreground" />
                      <p className="text-xs text-muted-foreground">Conectado ahora</p>
                      <p className="text-xl font-bold">{status === 'connected' ? 'Sí' : 'No'}</p>
                    </div>
                  </div>

                  <div className="mt-5 flex flex-wrap gap-2">
                    {status !== 'connected' && (
                      <Button variant="outline" onClick={handleShowQr} disabled={qrLoading}>
                        {qrLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <QrCode className="mr-2 h-4 w-4" />}
                        {showingQr ? 'Ocultar código' : 'Mostrar código QR'}
                      </Button>
                    )}
                    <Button variant="outline" onClick={checkStatus} disabled={statusLoading}>
                      <RefreshCw className="mr-2 h-4 w-4" />
                      Actualizar Estado
                    </Button>
                    <Button variant="destructive" onClick={handleDisconnect} disabled={disconnecting}>
                      {disconnecting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                      Desconectar
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* QR card */}
              {showingQr && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <QrCode className="h-4 w-4" /> Escanea el código QR con WhatsApp
                    </CardTitle>
                    <CardDescription>
                      Abre WhatsApp en tu teléfono → Ajustes → Dispositivos vinculados → Vincular un dispositivo y escanea este código.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-col items-center gap-3 pt-2">
                    {qr ? (
                      <>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={qr} alt="Código QR de WhatsApp" className="h-60 w-60 rounded-lg border object-contain" />
                        <p className="text-xs text-muted-foreground">
                          Cuando el teléfono lo escanee, el estado cambiará automáticamente a &quot;Conectado&quot;.
                        </p>
                      </>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        Aún no hay un código disponible. Presiona &quot;Mostrar código QR&quot; para generarlo.
                      </p>
                    )}
                    <Button variant="outline" onClick={handleShowQr}>
                      Ocultar código
                    </Button>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
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
        {/* Pagos y Cobros tab (Stripe Connect) */}
        <TabsContent value="payments">
          <StripeConnectCard />
        </TabsContent>
      </Tabs>
    </div>
  );
}