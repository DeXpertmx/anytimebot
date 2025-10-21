
'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Loader2, CheckCircle, XCircle, MessageCircle, Zap } from 'lucide-react';
import { toast } from 'react-hot-toast';

export default function IntegrationsPage() {
  const { data: session } = useSession() || {};
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [activeProvider, setActiveProvider] = useState<'evolution' | 'twilio'>('evolution');

  // Evolution API state
  const [evolutionConfig, setEvolutionConfig] = useState({
    apiUrl: '',
    apiKey: '',
    instanceName: '',
    phone: '',
  });

  // Twilio state
  const [twilioConfig, setTwilioConfig] = useState({
    accountSid: '',
    authToken: '',
    phoneNumber: '',
  });

  const [evolutionStatus, setEvolutionStatus] = useState<'connected' | 'disconnected' | 'unknown'>('unknown');
  const [twilioStatus, setTwilioStatus] = useState<'connected' | 'disconnected' | 'unknown'>('unknown');

  // Load configurations on mount
  useEffect(() => {
    loadConfigurations();
  }, []);

  const loadConfigurations = async () => {
    try {
      // Load Evolution API config
      const evolutionRes = await fetch('/api/whatsapp/config');
      if (evolutionRes.ok) {
        const data = await evolutionRes.json();
        setEvolutionConfig({
          apiUrl: data.evolutionApiUrl || '',
          apiKey: data.evolutionApiKey || '',
          instanceName: data.evolutionInstanceName || '',
          phone: data.whatsappPhone || '',
        });
        setEvolutionStatus(data.evolutionApiUrl ? 'connected' : 'disconnected');
      }

      // Load Twilio config
      const twilioRes = await fetch('/api/integrations/twilio/config');
      if (twilioRes.ok) {
        const data = await twilioRes.json();
        setTwilioConfig({
          accountSid: data.accountSid || '',
          authToken: '', // Don't load token for security
          phoneNumber: data.phoneNumber || '',
        });
        setTwilioStatus(data.hasAuthToken ? 'connected' : 'disconnected');
        setActiveProvider(data.provider || 'evolution');
      }
    } catch (error) {
      console.error('Error loading configurations:', error);
    }
  };

  const saveEvolutionConfig = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/whatsapp/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          evolutionApiUrl: evolutionConfig.apiUrl,
          evolutionApiKey: evolutionConfig.apiKey,
          evolutionInstanceName: evolutionConfig.instanceName,
          whatsappPhone: evolutionConfig.phone,
          provider: 'evolution',
        }),
      });

      if (response.ok) {
        toast.success('Evolution API configurado exitosamente');
        setEvolutionStatus('connected');
        setActiveProvider('evolution');
      } else {
        const error = await response.json();
        toast.error(error.error || 'Error al guardar configuración');
      }
    } catch (error) {
      console.error('Error saving Evolution config:', error);
      toast.error('Error al guardar configuración');
    } finally {
      setLoading(false);
    }
  };

  const saveTwilioConfig = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/integrations/twilio/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountSid: twilioConfig.accountSid,
          authToken: twilioConfig.authToken,
          phoneNumber: twilioConfig.phoneNumber,
          provider: 'twilio',
        }),
      });

      if (response.ok) {
        toast.success('Twilio configurado exitosamente');
        setTwilioStatus('connected');
        setActiveProvider('twilio');
      } else {
        const error = await response.json();
        toast.error(error.error || 'Error al guardar configuración');
      }
    } catch (error) {
      console.error('Error saving Twilio config:', error);
      toast.error('Error al guardar configuración');
    } finally {
      setLoading(false);
    }
  };

  const testEvolutionConnection = async () => {
    setTesting(true);
    try {
      const response = await fetch('/api/whatsapp/test', {
        method: 'POST',
      });

      if (response.ok) {
        toast.success('Conexión exitosa con Evolution API');
        setEvolutionStatus('connected');
      } else {
        const error = await response.json();
        toast.error(error.error || 'Error en la conexión');
        setEvolutionStatus('disconnected');
      }
    } catch (error) {
      console.error('Error testing Evolution connection:', error);
      toast.error('Error al probar conexión');
      setEvolutionStatus('disconnected');
    } finally {
      setTesting(false);
    }
  };

  const testTwilioConnection = async () => {
    setTesting(true);
    try {
      const response = await fetch('/api/integrations/twilio/test', {
        method: 'POST',
      });

      if (response.ok) {
        const data = await response.json();
        toast.success(`Conexión exitosa: ${data.account?.friendlyName || 'Twilio'}`);
        setTwilioStatus('connected');
      } else {
        const error = await response.json();
        toast.error(error.error || 'Error en la conexión');
        setTwilioStatus('disconnected');
      }
    } catch (error) {
      console.error('Error testing Twilio connection:', error);
      toast.error('Error al probar conexión');
      setTwilioStatus('disconnected');
    } finally {
      setTesting(false);
    }
  };

  const disconnectEvolution = async () => {
    if (!confirm('¿Estás seguro de desconectar Evolution API?')) return;

    setLoading(true);
    try {
      const response = await fetch('/api/whatsapp/config', {
        method: 'DELETE',
      });

      if (response.ok) {
        toast.success('Evolution API desconectado');
        setEvolutionConfig({ apiUrl: '', apiKey: '', instanceName: '', phone: '' });
        setEvolutionStatus('disconnected');
      }
    } catch (error) {
      console.error('Error disconnecting Evolution:', error);
      toast.error('Error al desconectar');
    } finally {
      setLoading(false);
    }
  };

  const disconnectTwilio = async () => {
    if (!confirm('¿Estás seguro de desconectar Twilio?')) return;

    setLoading(true);
    try {
      const response = await fetch('/api/integrations/twilio/config', {
        method: 'DELETE',
      });

      if (response.ok) {
        toast.success('Twilio desconectado');
        setTwilioConfig({ accountSid: '', authToken: '', phoneNumber: '' });
        setTwilioStatus('disconnected');
      }
    } catch (error) {
      console.error('Error disconnecting Twilio:', error);
      toast.error('Error al desconectar');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Integraciones de WhatsApp</h1>
        <p className="text-muted-foreground">
          Conecta tu cuenta con Evolution API o Twilio para enviar y recibir mensajes de WhatsApp
        </p>
      </div>

      {/* Active Provider Badge */}
      <Alert>
        <MessageCircle className="h-4 w-4" />
        <AlertDescription>
          Proveedor activo: <Badge variant="default" className="ml-2">{activeProvider === 'evolution' ? 'Evolution API' : 'Twilio'}</Badge>
        </AlertDescription>
      </Alert>

      <Tabs defaultValue="evolution" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="evolution" className="flex items-center gap-2">
            <Zap className="h-4 w-4" />
            Evolution API
            {evolutionStatus === 'connected' && (
              <CheckCircle className="h-3 w-3 text-green-500" />
            )}
          </TabsTrigger>
          <TabsTrigger value="twilio" className="flex items-center gap-2">
            <MessageCircle className="h-4 w-4" />
            Twilio
            {twilioStatus === 'connected' && (
              <CheckCircle className="h-3 w-3 text-green-500" />
            )}
          </TabsTrigger>
        </TabsList>

        {/* Evolution API Tab */}
        <TabsContent value="evolution">
          <Card>
            <CardHeader>
              <CardTitle>Evolution API</CardTitle>
              <CardDescription>
                Configura tu instancia de Evolution API para WhatsApp
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="evolution-url">URL de API</Label>
                <Input
                  id="evolution-url"
                  placeholder="https://api.evolution.com"
                  value={evolutionConfig.apiUrl}
                  onChange={(e) => setEvolutionConfig({ ...evolutionConfig, apiUrl: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="evolution-key">API Key</Label>
                <Input
                  id="evolution-key"
                  type="password"
                  placeholder="Tu Evolution API Key"
                  value={evolutionConfig.apiKey}
                  onChange={(e) => setEvolutionConfig({ ...evolutionConfig, apiKey: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="evolution-instance">Nombre de Instancia</Label>
                <Input
                  id="evolution-instance"
                  placeholder="mi-instancia"
                  value={evolutionConfig.instanceName}
                  onChange={(e) => setEvolutionConfig({ ...evolutionConfig, instanceName: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="evolution-phone">Número de Teléfono</Label>
                <Input
                  id="evolution-phone"
                  placeholder="+1234567890"
                  value={evolutionConfig.phone}
                  onChange={(e) => setEvolutionConfig({ ...evolutionConfig, phone: e.target.value })}
                />
              </div>

              <div className="flex gap-2">
                <Button
                  onClick={saveEvolutionConfig}
                  disabled={loading || !evolutionConfig.apiUrl || !evolutionConfig.apiKey}
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Guardar Configuración
                </Button>

                {evolutionStatus === 'connected' && (
                  <>
                    <Button
                      variant="outline"
                      onClick={testEvolutionConnection}
                      disabled={testing}
                    >
                      {testing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                      Probar Conexión
                    </Button>

                    <Button
                      variant="destructive"
                      onClick={disconnectEvolution}
                      disabled={loading}
                    >
                      Desconectar
                    </Button>
                  </>
                )}
              </div>

              {evolutionStatus === 'connected' && (
                <Alert>
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  <AlertDescription className="text-green-700">
                    Evolution API conectado correctamente
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Twilio Tab */}
        <TabsContent value="twilio">
          <Card>
            <CardHeader>
              <CardTitle>Twilio WhatsApp</CardTitle>
              <CardDescription>
                Configura tu cuenta de Twilio para enviar y recibir mensajes de WhatsApp
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert>
                <AlertDescription>
                  Necesitas una cuenta de Twilio con WhatsApp habilitado. 
                  <a 
                    href="https://www.twilio.com/whatsapp" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline ml-1"
                  >
                    Más información aquí
                  </a>
                </AlertDescription>
              </Alert>

              <div className="space-y-2">
                <Label htmlFor="twilio-sid">Account SID</Label>
                <Input
                  id="twilio-sid"
                  placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                  value={twilioConfig.accountSid}
                  onChange={(e) => setTwilioConfig({ ...twilioConfig, accountSid: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="twilio-token">Auth Token</Label>
                <Input
                  id="twilio-token"
                  type="password"
                  placeholder="Tu Twilio Auth Token"
                  value={twilioConfig.authToken}
                  onChange={(e) => setTwilioConfig({ ...twilioConfig, authToken: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="twilio-phone">Número de WhatsApp</Label>
                <Input
                  id="twilio-phone"
                  placeholder="+14155238886"
                  value={twilioConfig.phoneNumber}
                  onChange={(e) => setTwilioConfig({ ...twilioConfig, phoneNumber: e.target.value })}
                />
                <p className="text-sm text-muted-foreground">
                  Usa el formato internacional, ej: +14155238886
                </p>
              </div>

              <div className="flex gap-2">
                <Button
                  onClick={saveTwilioConfig}
                  disabled={loading || !twilioConfig.accountSid || !twilioConfig.authToken}
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Guardar Configuración
                </Button>

                {twilioStatus === 'connected' && (
                  <>
                    <Button
                      variant="outline"
                      onClick={testTwilioConnection}
                      disabled={testing}
                    >
                      {testing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                      Probar Conexión
                    </Button>

                    <Button
                      variant="destructive"
                      onClick={disconnectTwilio}
                      disabled={loading}
                    >
                      Desconectar
                    </Button>
                  </>
                )}
              </div>

              {twilioStatus === 'connected' && (
                <Alert>
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  <AlertDescription className="text-green-700">
                    Twilio conectado correctamente
                  </AlertDescription>
                </Alert>
              )}

              {/* Webhook URL Info */}
              <Alert>
                <AlertDescription>
                  <strong>Webhook URL:</strong>
                  <code className="block mt-2 p-2 bg-gray-100 rounded text-sm">
                    {typeof window !== 'undefined' ? `${window.location.origin}/api/integrations/twilio/webhook` : ''}
                  </code>
                  <p className="mt-2 text-sm">
                    Configura esta URL en tu consola de Twilio para recibir mensajes entrantes
                  </p>
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
