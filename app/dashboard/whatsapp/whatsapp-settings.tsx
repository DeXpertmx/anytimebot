
'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { MessageCircle, Send, CheckCircle2, XCircle, Clock, Loader2 } from 'lucide-react';

interface WhatsAppMessage {
  id: string;
  phone: string;
  message: string;
  direction: 'OUTGOING' | 'INCOMING';
  status: string;
  createdAt: string;
}

interface WhatsAppSettingsProps {
  canUseEvolution: boolean;
  canUseTwilio: boolean;
}

export default function WhatsAppSettings({ canUseEvolution, canUseTwilio }: WhatsAppSettingsProps) {
  const { data: session } = useSession() || {};
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [statusLoading, setStatusLoading] = useState(false);
  const [testLoading, setTestLoading] = useState(false);
  const [whatsappEnabled, setWhatsappEnabled] = useState(false);
  const [whatsappPhone, setWhatsappPhone] = useState('');
  const [evolutionApiUrl, setEvolutionApiUrl] = useState('');
  const [evolutionApiKey, setEvolutionApiKey] = useState('');
  const [evolutionInstanceName, setEvolutionInstanceName] = useState('');
  const [connectionStatus, setConnectionStatus] = useState<any>(null);
  const [messages, setMessages] = useState<WhatsAppMessage[]>([]);
  const [testPhone, setTestPhone] = useState('');
  const [testMessage, setTestMessage] = useState('');

  // Load user settings
  useEffect(() => {
    if (session?.user) {
      fetchUserSettings();
      checkConnectionStatus();
    }
  }, [session]);

  const fetchUserSettings = async () => {
    try {
      const response = await fetch('/api/user/settings');
      if (response.ok) {
        const data = await response.json();
        setWhatsappEnabled(data.whatsappEnabled || false);
        setWhatsappPhone(data.whatsappPhone || '');
        setEvolutionApiUrl(data.evolutionApiUrl || '');
        setEvolutionApiKey(data.evolutionApiKey || '');
        setEvolutionInstanceName(data.evolutionInstanceName || '');
      }
    } catch (error) {
      console.error('Error fetching settings:', error);
    }
  };

  const checkConnectionStatus = async () => {
    setStatusLoading(true);
    try {
      const response = await fetch('/api/whatsapp/status');
      if (response.ok) {
        const result = await response.json();
        setConnectionStatus(result);
      }
    } catch (error) {
      console.error('Error checking status:', error);
    } finally {
      setStatusLoading(false);
    }
  };

  const handleSaveSettings = async () => {
    if (whatsappEnabled && (!evolutionApiUrl || !evolutionApiKey || !evolutionInstanceName)) {
      toast({
        title: 'Configuración incompleta',
        description: 'Por favor completa todos los campos de la API de Evolution para habilitar WhatsApp.',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/user/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          whatsappEnabled,
          whatsappPhone,
          evolutionApiUrl,
          evolutionApiKey,
          evolutionInstanceName,
        }),
      });

      if (response.ok) {
        toast({
          title: 'Configuración guardada',
          description: 'Los ajustes de WhatsApp se han guardado correctamente.',
        });
        // Refresh settings and connection status
        await fetchUserSettings();
        await checkConnectionStatus();
      } else {
        throw new Error('Failed to save settings');
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'No se pudo guardar la configuración.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSendTestMessage = async () => {
    if (!testPhone || !testMessage) {
      toast({
        title: 'Campos requeridos',
        description: 'Por favor ingresa un número de teléfono y un mensaje.',
        variant: 'destructive',
      });
      return;
    }

    setTestLoading(true);
    try {
      const response = await fetch('/api/whatsapp/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: testPhone,
          message: testMessage,
        }),
      });

      const result = await response.json();

      if (result.success) {
        toast({
          title: '✅ Mensaje enviado',
          description: 'El mensaje de prueba se envió correctamente.',
        });
        setTestPhone('');
        setTestMessage('');
      } else {
        throw new Error(result.error || 'Failed to send message');
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'No se pudo enviar el mensaje de prueba.',
        variant: 'destructive',
      });
    } finally {
      setTestLoading(false);
    }
  };

  const getStatusBadge = () => {
    if (statusLoading) {
      return <Badge variant="secondary"><Loader2 className="h-3 w-3 animate-spin mr-1" />Verificando...</Badge>;
    }

    if (!connectionStatus) {
      return <Badge variant="secondary">Desconocido</Badge>;
    }

    // Check both new format (connected) and old format (data.state)
    const isConnected = connectionStatus.connected || 
                        connectionStatus.data?.state === 'open' ||
                        connectionStatus.data?.instance?.state === 'open';

    if (connectionStatus.success && isConnected) {
      return <Badge variant="default" className="bg-green-500"><CheckCircle2 className="h-3 w-3 mr-1" />Conectado</Badge>;
    }

    return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Desconectado</Badge>;
  };

  return (
    <div className="container mx-auto py-8 px-4 max-w-6xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <MessageCircle className="h-8 w-8 text-green-500" />
            Integración de WhatsApp
          </h1>
          <p className="text-muted-foreground mt-2">
            Configura las notificaciones automáticas por WhatsApp para tus reservas
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Estado:</span>
          {getStatusBadge()}
        </div>
      </div>

      <div className="grid gap-6">
        {/* Configuration Card */}
        <Card>
          <CardHeader>
            <CardTitle>Configuración de WhatsApp</CardTitle>
            <CardDescription>
              Activa las notificaciones por WhatsApp y configura tu número de contacto
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between space-x-2">
              <div className="flex-1">
                <Label htmlFor="whatsapp-enabled" className="text-base">
                  Habilitar notificaciones por WhatsApp
                </Label>
                <p className="text-sm text-muted-foreground mt-1">
                  Los clientes recibirán confirmaciones y recordatorios por WhatsApp
                </p>
              </div>
              <Switch
                id="whatsapp-enabled"
                checked={whatsappEnabled}
                onCheckedChange={setWhatsappEnabled}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="whatsapp-phone">
                Tu número de WhatsApp (opcional)
              </Label>
              <Input
                id="whatsapp-phone"
                type="tel"
                placeholder="+1234567890"
                value={whatsappPhone}
                onChange={(e) => setWhatsappPhone(e.target.value)}
              />
              <p className="text-sm text-muted-foreground">
                Formato internacional con código de país (ej: +52 1234567890)
              </p>
            </div>

            <div className="border-t pt-4 space-y-4">
              <h3 className="font-semibold text-sm">Credenciales de Evolution API</h3>
              <p className="text-sm text-muted-foreground">
                Configura tu propia instancia de Evolution API para enviar mensajes de WhatsApp
              </p>

              <div className="space-y-2">
                <Label htmlFor="evolution-api-url">
                  URL de la API <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="evolution-api-url"
                  type="url"
                  placeholder="https://evo.arktech.dev"
                  value={evolutionApiUrl}
                  onChange={(e) => setEvolutionApiUrl(e.target.value)}
                />
                <p className="text-sm text-muted-foreground">
                  La URL base de tu instancia de Evolution API
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="evolution-api-key">
                  API Key <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="evolution-api-key"
                  type="password"
                  placeholder="Tu API Key"
                  value={evolutionApiKey}
                  onChange={(e) => setEvolutionApiKey(e.target.value)}
                />
                <p className="text-sm text-muted-foreground">
                  La clave de API para autenticación
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="evolution-instance-name">
                  Nombre de la Instancia <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="evolution-instance-name"
                  type="text"
                  placeholder="mi-instancia"
                  value={evolutionInstanceName}
                  onChange={(e) => setEvolutionInstanceName(e.target.value)}
                />
                <p className="text-sm text-muted-foreground">
                  El nombre de tu instancia en Evolution API
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <Button onClick={handleSaveSettings} disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Guardar configuración
              </Button>
              <Button variant="outline" onClick={checkConnectionStatus} disabled={statusLoading}>
                {statusLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Verificar conexión
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Test Message Card */}
        <Card>
          <CardHeader>
            <CardTitle>Enviar mensaje de prueba</CardTitle>
            <CardDescription>
              Prueba la integración enviando un mensaje de WhatsApp
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="test-phone">Número de teléfono</Label>
              <Input
                id="test-phone"
                type="tel"
                placeholder="+1234567890"
                value={testPhone}
                onChange={(e) => setTestPhone(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="test-message">Mensaje</Label>
              <Input
                id="test-message"
                placeholder="Hola, este es un mensaje de prueba"
                value={testMessage}
                onChange={(e) => setTestMessage(e.target.value)}
              />
            </div>

            <Button onClick={handleSendTestMessage} disabled={testLoading}>
              {testLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-2 h-4 w-4" />
              )}
              Enviar mensaje de prueba
            </Button>
          </CardContent>
        </Card>

        {/* Info Card */}
        <Card>
          <CardHeader>
            <CardTitle>Cómo funciona</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex gap-3">
                <CheckCircle2 className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium">Confirmaciones automáticas</p>
                  <p className="text-sm text-muted-foreground">
                    Cuando un cliente agenda una cita, recibe automáticamente una confirmación por WhatsApp
                  </p>
                </div>
              </div>

              <div className="flex gap-3">
                <Clock className="h-5 w-5 text-blue-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium">Recordatorios</p>
                  <p className="text-sm text-muted-foreground">
                    Los clientes reciben recordatorios antes de su cita programada
                  </p>
                </div>
              </div>

              <div className="flex gap-3">
                <XCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium">Notificaciones de cancelación</p>
                  <p className="text-sm text-muted-foreground">
                    Si se cancela una cita, el cliente recibe una notificación inmediata
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Connection Details */}
        {connectionStatus && connectionStatus.data && (
          <Card>
            <CardHeader>
              <CardTitle>Detalles de la conexión</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 font-mono text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Instancia:</span>
                  <span className="font-medium">Arktech</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Estado:</span>
                  <span className="font-medium">{connectionStatus.data.state || 'N/A'}</span>
                </div>
                {connectionStatus.data.instance && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Estado de instancia:</span>
                    <span className="font-medium">{connectionStatus.data.instance.state || 'N/A'}</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
