
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Calendar, Clock, MapPin, User, Mail, Phone, Video, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MeetingBriefing } from '@/components/dashboard/meeting-briefing';
import { toast } from 'sonner';

interface Booking {
  id: string;
  guestName: string;
  guestEmail: string;
  guestPhone?: string;
  startTime: string;
  endTime: string;
  timezone: string;
  status: string;
  formData?: any;
  eventType: {
    name: string;
    duration: number;
    location: string;
    videoLink?: string;
    formFields?: Array<{ id: string; label: string }>;
  };
}

export default function BookingDetailsPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [booking, setBooking] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    loadBooking();
  }, [params.id]);

  const loadBooking = async () => {
    try {
      const response = await fetch(`/api/bookings/${params.id}`);
      if (!response.ok) throw new Error('No se pudo cargar la reserva');
      
      const data = await response.json();
      if (data.success) {
        setBooking(data.data);
      }
    } catch (error) {
      console.error('Error loading booking:', error);
      toast.error('No se pudo cargar la reserva');
    } finally {
      setLoading(false);
    }
  };

  // Get-or-create the video session (idempotent) before entering the room,
  // so bookings created without a session don't land on "Video session not found".
  const joinMeeting = async () => {
    if (!booking || joining) return;
    setJoining(true);
    try {
      const res = await fetch('/api/video-sessions/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId: booking.id }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        toast.error(data.error || 'No se pudo crear la sala de reunión');
        return;
      }
      router.push(`/meeting/${booking.id}`);
    } catch (error) {
      console.error('Error creating video session:', error);
      toast.error('No se pudo crear la sala de reunión');
    } finally {
      setJoining(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Cargando reserva...</p>
        </div>
      </div>
    );
  }

  if (!booking) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-muted-foreground">No se encontró la reserva</p>
          <Button onClick={() => router.push('/dashboard/bookings')} className="mt-4">
            Volver a reservas
          </Button>
        </div>
      </div>
    );
  }

  const startDate = new Date(booking.startTime);
  const endDate = new Date(booking.endTime);

  return (
    <div className="container max-w-6xl py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push('/dashboard/bookings')}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Atrás
          </Button>
          <div>
            <h1 className="text-3xl font-bold">{booking.eventType.name}</h1>
            <p className="text-muted-foreground">
              Booking #{booking.id.slice(0, 8)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {(booking.status === 'CONFIRMED' || booking.status === 'PENDING') && (
            <Button
              onClick={joinMeeting}
              disabled={joining}
              className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700"
            >
              {joining ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Video className="h-4 w-4 mr-2" />
              )}
              {joining ? 'Creando sala...' : 'Unirse a la Reunión'}
            </Button>
          )}
          <Badge
            variant={
              booking.status === 'CONFIRMED'
                ? 'default'
                : booking.status === 'CANCELLED'
                ? 'destructive'
                : 'secondary'
            }
          >
            {booking.status}
          </Badge>
        </div>
      </div>

      <Tabs defaultValue="details" className="space-y-6">
        <TabsList>
          <TabsTrigger value="details">Detalles</TabsTrigger>
          <TabsTrigger value="briefing">Resumen previo a la reunión</TabsTrigger>
        </TabsList>

        <TabsContent value="details" className="space-y-6">
          {/* Información del invitado */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Información del invitado
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Nombre</label>
                  <p className="text-lg">{booking.guestName}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Correo electrónico</label>
                  <p className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    {booking.guestEmail}
                  </p>
                </div>
                {booking.guestPhone && (
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Teléfono</label>
                    <p className="flex items-center gap-2">
                      <Phone className="h-4 w-4 text-muted-foreground" />
                      {booking.guestPhone}
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Detalles de la reunión */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Detalles de la reunión
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Fecha</label>
                  <p className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    {startDate.toLocaleDateString('es-ES', {
                      weekday: 'long',
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Hora</label>
                  <p className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    {startDate.toLocaleTimeString('es-ES', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}{' '}
                    -{' '}
                    {endDate.toLocaleTimeString('es-ES', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Duración</label>
                  <p>{booking.eventType.duration} minutes</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Zona horaria</label>
                  <p>{booking.timezone}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Ubicación</label>
                  <p className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    {booking.eventType.location}
                  </p>
                </div>
                {booking.eventType.videoLink && (
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Enlace de video</label>
                    <a
                      href={booking.eventType.videoLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-primary hover:underline"
                    >
                      <Video className="h-4 w-4" />
                      Unirse a la reunión
                    </a>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Form Data */}
          {booking.formData && Object.keys(booking.formData).length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Respuestas del formulario</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {Object.entries(booking.formData).map(([key, value]) => {
                    // Resolve the human-readable label from the event type's
                    // custom form fields; fall back to the raw key (guestName etc.)
                    const field = booking.eventType?.formFields?.find((f: { id: string }) => f.id === key);
                    const label = field?.label ?? key.replace(/([A-Z])/g, ' $1').trim();
                    return (
                      <div key={key}>
                        <label className="text-sm font-medium text-muted-foreground">{label}</label>
                        <p className="mt-1">{typeof value === 'boolean' ? (value ? 'Sí' : 'No') : String(value)}</p>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="briefing">
          <MeetingBriefing bookingId={params.id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

