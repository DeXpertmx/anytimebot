
'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Calendar, CheckCircle2, XCircle, Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'react-hot-toast';

interface CalendarStatus {
  connected: boolean;
  calendar?: {
    id: string;
    summary: string;
    timeZone: string;
  };
  error?: string;
}

export default function CalendarPage() {
  const { data: session, status } = useSession() || {};
  const router = useRouter();
  const searchParams = useSearchParams();
  const [calendarStatus, setCalendarStatus] = useState<CalendarStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncEnabled, setSyncEnabled] = useState(true);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
    }
  }, [status, router]);

  useEffect(() => {
    // Check for success/error messages in URL params
    const success = searchParams.get('success');
    const error = searchParams.get('error');
    
    if (success === 'true') {
      toast.success('¡Google Calendar conectado exitosamente!');
      // Clean URL
      window.history.replaceState({}, '', '/dashboard/calendar');
    } else if (error) {
      let errorMessage = 'Error al conectar Google Calendar';
      switch (error) {
        case 'access_denied':
          errorMessage = 'Acceso denegado. Por favor, acepta los permisos necesarios.';
          break;
        case 'token_exchange_failed':
          errorMessage = 'Error en el intercambio de tokens. Inténtalo de nuevo.';
          break;
        case 'callback_failed':
          errorMessage = 'Error en el proceso de conexión. Inténtalo de nuevo.';
          break;
      }
      toast.error(errorMessage);
      // Clean URL
      window.history.replaceState({}, '', '/dashboard/calendar');
    }
  }, [searchParams]);

  useEffect(() => {
    if (session) {
      fetchCalendarStatus();
    }
  }, [session]);

  const fetchCalendarStatus = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/calendar/status');
      const data = await response.json();
      setCalendarStatus(data);
    } catch (error) {
      console.error('Error fetching calendar status:', error);
      toast.error('Error al verificar el estado del calendario');
    } finally {
      setLoading(false);
    }
  };

  const handleSyncToggle = async (enabled: boolean) => {
    try {
      setUpdating(true);
      const response = await fetch('/api/calendar/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ calendarSyncEnabled: enabled }),
      });

      if (response.ok) {
        setSyncEnabled(enabled);
        toast.success(
          enabled
            ? 'Sincronización activada'
            : 'Sincronización desactivada'
        );
      } else {
        throw new Error('Failed to update sync settings');
      }
    } catch (error) {
      console.error('Error updating sync settings:', error);
      toast.error('Error al actualizar la configuración');
    } finally {
      setUpdating(false);
    }
  };

  const handleConnectCalendar = () => {
    // Redirect to Google OAuth via our custom endpoint
    window.location.href = '/api/calendar/connect';
  };

  if (status === 'loading' || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 px-4 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Configuración de Calendario</h1>
        <p className="text-muted-foreground">
          Conecta tu Google Calendar para sincronizar tus reservas automáticamente
        </p>
      </div>

      <div className="space-y-6">
        {/* Connection Status Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Estado de Conexión
            </CardTitle>
            <CardDescription>
              Estado actual de tu integración con Google Calendar
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {calendarStatus?.connected ? (
                  <>
                    <CheckCircle2 className="h-8 w-8 text-green-500" />
                    <div>
                      <p className="font-medium">Conectado</p>
                      {calendarStatus.calendar && (
                        <p className="text-sm text-muted-foreground">
                          {calendarStatus.calendar.summary} ({calendarStatus.calendar.timeZone})
                        </p>
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <XCircle className="h-8 w-8 text-red-500" />
                    <div>
                      <p className="font-medium">No Conectado</p>
                      <p className="text-sm text-muted-foreground">
                        Conecta tu cuenta de Google para comenzar
                      </p>
                    </div>
                  </>
                )}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={fetchCalendarStatus}
                  disabled={loading}
                >
                  <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                  Actualizar
                </Button>
                {!calendarStatus?.connected && (
                  <Button onClick={handleConnectCalendar}>
                    Conectar Google Calendar
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Sync Settings Card */}
        {calendarStatus?.connected && (
          <Card>
            <CardHeader>
              <CardTitle>Configuración de Sincronización</CardTitle>
              <CardDescription>
                Personaliza cómo se sincronizan tus reservas con Google Calendar
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label htmlFor="sync-enabled" className="text-base">
                    Sincronización Automática
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Crear eventos en Google Calendar automáticamente cuando se haga una reserva
                  </p>
                </div>
                <Switch
                  id="sync-enabled"
                  checked={syncEnabled}
                  onCheckedChange={handleSyncToggle}
                  disabled={updating}
                />
              </div>

              <div className="border-t pt-6">
                <h3 className="font-medium mb-3">Funcionalidades Activas</h3>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                    Creación automática de eventos al confirmar reservas
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                    Verificación de disponibilidad en tiempo real
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                    Notificaciones a los asistentes vía Gmail
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                    Actualización automática al modificar o cancelar
                  </li>
                </ul>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Info Card */}
        <Card className="bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800">
          <CardContent className="pt-6">
            <div className="flex gap-4">
              <div className="flex-shrink-0">
                <Calendar className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
              <div className="space-y-2 text-sm">
                <p className="font-medium text-blue-900 dark:text-blue-100">
                  ¿Cómo funciona la sincronización?
                </p>
                <ul className="space-y-1 text-blue-800 dark:text-blue-200">
                  <li>• Las reservas confirmadas se crean automáticamente en tu Google Calendar</li>
                  <li>• La disponibilidad se verifica contra tu calendario antes de aceptar reservas</li>
                  <li>• Los cambios y cancelaciones se reflejan automáticamente</li>
                  <li>• Los invitados reciben notificaciones por email a través de Google Calendar</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
