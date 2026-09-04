
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Calendar, Clock, MapPin, Sofa, User, Mail, Phone, Video, Loader2, CheckCircle2, XCircle, Flag, NotebookPen, Save } from 'lucide-react';
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
  notes?: string | null;
  completedAt?: string | null;
  updatedAt?: string;
  formData?: any;
  resourceName?: string | null;
  locationName?: string | null;
  locationAddress?: string | null;
  eventType: {
    name: string;
    duration: number;
    location: string;
    videoLink?: string;
    formFields?: Array<{ id: string; label: string }>;
  };
}

function bookingStatusLabel(status: string) {
  switch (status) {
    case 'CONFIRMED': return 'Confirmada';
    case 'CANCELLED': return 'Cancelada';
    case 'COMPLETED': return 'Finalizada';
    default: return 'Pendiente';
  }
}

export default function BookingDetailsPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [booking, setBooking] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [notesDraft, setNotesDraft] = useState('');
  const [notesSaving, setNotesSaving] = useState(false);

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
        setNotesDraft(data.data.notes ?? '');
      }
    } catch (error) {
      console.error('Error loading booking:', error);
      toast.error('No se pudo cargar la reserva');
    } finally {
      setLoading(false);
    }
  };

  // Change the booking status (confirm / finish / cancel) with guest notification.
  const updateBookingStatus = async (status: 'CONFIRMED' | 'COMPLETED' | 'CANCELLED') => {
    if (!booking || actionLoading) return;
    const message =
      status === 'CANCELLED'
        ? '¿Seguro que quieres cancelar esta cita? El cliente recibirá un aviso de cancelación.'
        : status === 'COMPLETED'
          ? '¿Marcar esta cita como finalizada? Podrás añadir notas o un resumen después.'
          : '¿Confirmar esta cita? El cliente recibirá la confirmación con los detalles.';
    if (!window.confirm(message)) return;
    setActionLoading(true);
    try {
      const response = await fetch(`/api/bookings/${booking.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const data = await response.json();
      if (response.ok && data.success) {
        const toastMsg = status === 'CONFIRMED' ? 'Cita confirmada' : status === 'COMPLETED' ? 'Cita finalizada' : 'Cita cancelada';
        toast.success(toastMsg);
        await loadBooking();
      } else {
        toast.error(data?.error || 'No se pudo actualizar la cita');
      }
    } catch (error) {
      console.error('Error updating booking status:', error);
      toast.error('Error al actualizar la cita');
    } finally {
      setActionLoading(false);
    }
  };

  // Save the host notes / meeting summary without changing the status.
  const saveNotes = async () => {
    if (!booking || notesSaving) return;
    setNotesSaving(true);
    try {
      const response = await fetch(`/api/bookings/${booking.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: booking.status,
          notes: notesDraft.trim() ? notesDraft.trim() : null,
        }),
      });
      const data = await response.json();
      if (response.ok && data.success) {
        toast.success('Notas guardadas');
        setBooking({ ...booking, notes: notesDraft.trim() ? notesDraft.trim() : null });
      } else {
        toast.error(data?.error || 'No se pudieron guardar las notas');
      }
    } catch (error) {
      console.error('Error saving booking notes:', error);
      toast.error('Error al guardar las notas');
    } finally {
      setNotesSaving(false);
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
        <div className="flex flex-wrap items-center justify-end gap-3">
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
          {booking.status === 'PENDING' && (
            <Button
              variant="outline"
              disabled={actionLoading}
              onClick={() => updateBookingStatus('CONFIRMED')}
              className="border-emerald-300 text-emerald-700 hover:bg-emerald-50"
            >
              {actionLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
              Confirmar
            </Button>
          )}
          {booking.status === 'CONFIRMED' && (
            <Button
              disabled={actionLoading}
              onClick={() => updateBookingStatus('COMPLETED')}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {actionLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Flag className="h-4 w-4 mr-2" />}
              Finalizar cita
            </Button>
          )}
          {(booking.status === 'PENDING' || booking.status === 'CONFIRMED') && (
            <Button
              variant="outline"
              disabled={actionLoading}
              onClick={() => updateBookingStatus('CANCELLED')}
              className="border-rose-300 text-rose-600 hover:bg-rose-50"
            >
              {actionLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <XCircle className="h-4 w-4 mr-2" />}
              Cancelar cita
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
            {bookingStatusLabel(booking.status)}
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
                {(booking.resourceName || booking.locationName || booking.locationAddress) && (
                  <div className="md:col-span-2 rounded-lg border border-indigo-100 bg-indigo-50/60 p-3">
                    <div className="flex items-center gap-2">
                      <Sofa className="h-4 w-4 text-indigo-600" />
                      <span className="font-medium text-indigo-900">
                        {booking.resourceName || 'Recurso asignado'}
                      </span>
                    </div>
                    {(booking.locationName || booking.locationAddress) && (
                      <p className="mt-1 flex items-center gap-1.5 text-sm text-indigo-800/80">
                        <MapPin className="h-3.5 w-3.5" />
                        {[booking.locationName, booking.locationAddress].filter(Boolean).join(' · ')}
                      </p>
                    )}
                  </div>
                )}
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

          {/* Notas y resumen del host */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <NotebookPen className="h-5 w-5" />
                Notas y resumen de la reunión
              </CardTitle>
            </CardHeader>
            <CardContent>
              <textarea
                value={notesDraft}
                onChange={(e) => setNotesDraft(e.target.value)}
                rows={4}
                placeholder="Escribe lo sucedido, acuerdos tomados o un resumen de la cita..."
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none resize-none"
              />
              <div className="mt-3 flex items-center justify-end gap-2">
                {booking.notes ? (
                  <p className="mr-auto text-xs text-muted-foreground">Última actualización: {new Date(booking.updatedAt ?? booking.completedAt ?? new Date()).toLocaleString('es-ES')}</p>
                ) : (
                  <p className="mr-auto text-xs text-muted-foreground">Notas internas: solo las verás tú.</p>
                )}
                <Button variant="outline" onClick={saveNotes} disabled={notesSaving}>
                  {notesSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                  Guardar notas
                </Button>
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

