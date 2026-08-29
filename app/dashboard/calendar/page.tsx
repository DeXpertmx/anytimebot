'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Calendar, CheckCircle2, XCircle, Loader2, RefreshCw, ChevronLeft, ChevronRight, Clock, Mail, UserRound } from 'lucide-react';
import { toast } from 'react-hot-toast';

interface Booking { id: string; guestName: string; guestEmail: string; startTime: string; endTime: string; status: string; eventType: { name: string; color?: string }; }
interface CalendarStatus { connected: boolean; calendar?: { id: string; summary: string; timeZone: string }; error?: string; }

const weekdays = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const palette = ['#63b3ed', '#a78bfa', '#86efac', '#f9a8d4', '#fcd34d'];

export default function CalendarPage() {
  const { data: session, status } = useSession() || {};
  const router = useRouter();
  const searchParams = useSearchParams();
  const [calendarStatus, setCalendarStatus] = useState<CalendarStatus | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [month, setMonth] = useState(() => new Date());
  const [loading, setLoading] = useState(true);
  const [syncEnabled, setSyncEnabled] = useState(true);
  const [updating, setUpdating] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [calendarResponse, bookingResponse] = await Promise.all([fetch('/api/calendar/status'), fetch('/api/bookings?status=all&limit=100')]);
      setCalendarStatus(await calendarResponse.json());
      const bookingData = await bookingResponse.json();
      if (bookingData.success) setBookings(bookingData.data.bookings);
    } catch { toast.error('No se pudo cargar el calendario'); } finally { setLoading(false); }
  };

  useEffect(() => { if (status === 'unauthenticated') router.push('/auth/signin'); }, [status, router]);
  useEffect(() => { if (session) load(); }, [session]);
  useEffect(() => {
    if (searchParams.get('success') === 'true') { toast.success('Google Calendar conectado exitosamente'); window.history.replaceState({}, '', '/dashboard/calendar'); }
    if (searchParams.get('error')) { toast.error('Error al conectar Google Calendar'); window.history.replaceState({}, '', '/dashboard/calendar'); }
  }, [searchParams]);

  const monthDays = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const start = new Date(first); start.setDate(first.getDate() - first.getDay());
    return Array.from({ length: 42 }, (_, index) => { const day = new Date(start); day.setDate(start.getDate() + index); return day; });
  }, [month]);
  const monthBookings = (day: Date) => bookings.filter(b => { const date = new Date(b.startTime); return date.getFullYear() === day.getFullYear() && date.getMonth() === day.getMonth() && date.getDate() === day.getDate(); });
  const formatTime = (date: string) => new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const monthLabel = month.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
  const today = new Date();

  const handleSyncToggle = async (enabled: boolean) => {
    setUpdating(true);
    try { const response = await fetch('/api/calendar/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ calendarSyncEnabled: enabled }) }); if (!response.ok) throw new Error(); setSyncEnabled(enabled); toast.success(enabled ? 'Sincronización activada' : 'Sincronización desactivada'); } catch { toast.error('Error al actualizar la configuración'); } finally { setUpdating(false); }
  };

  if (status === 'loading' || loading) return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  return <div className="min-h-screen bg-slate-50/70">
    <div className="mx-auto max-w-7xl px-6 py-8">
      <div className="mb-8 flex items-end justify-between"><div><p className="mb-1 text-sm font-medium text-indigo-600">Agenda</p><h1 className="text-3xl font-bold tracking-tight text-slate-900">Calendario</h1><p className="mt-2 text-slate-500">Organiza tus citas y revisa tu disponibilidad.</p></div><Button variant="outline" onClick={load}><RefreshCw className="mr-2 h-4 w-4" />Actualizar</Button></div>
      <div className="mb-6 flex flex-wrap items-center gap-4 rounded-xl border bg-white px-5 py-4 shadow-sm"><div className="flex items-center gap-2 text-sm font-medium text-slate-700"><span className="h-3 w-3 rounded-full bg-emerald-400" />Confirmadas</div><div className="flex items-center gap-2 text-sm font-medium text-slate-700"><span className="h-3 w-3 rounded-full bg-amber-400" />Pendientes</div><div className="ml-auto text-sm text-slate-500">{bookings.length} citas cargadas</div></div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Card className="overflow-hidden rounded-xl border-slate-200 shadow-sm"><CardHeader className="border-b bg-white px-6 py-5"><div className="flex flex-wrap items-center justify-between gap-4"><div><CardTitle className="flex items-center gap-2 text-xl"><Calendar className="h-5 w-5 text-indigo-600" />Mis citas</CardTitle><CardDescription>Reservas confirmadas y pendientes</CardDescription></div><div className="flex items-center gap-2"><Button variant="outline" size="icon" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}><ChevronLeft className="h-4 w-4" /></Button><span className="min-w-40 text-center font-semibold capitalize text-slate-800">{monthLabel}</span><Button variant="outline" size="icon" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}><ChevronRight className="h-4 w-4" /></Button></div></div></CardHeader><CardContent className="bg-white p-5"><div className="grid grid-cols-7 overflow-hidden rounded-lg border border-slate-200 text-xs">{weekdays.map(day => <div key={day} className="border-b border-r bg-slate-50 p-3 text-center font-semibold text-slate-500 last:border-r-0">{day}</div>)}{monthDays.map(day => { const dayBookings = monthBookings(day); const currentMonth = day.getMonth() === month.getMonth(); const isToday = day.toDateString() === today.toDateString(); return <div key={day.toISOString()} className={`min-h-32 border-b border-r border-slate-200 p-2 ${currentMonth ? 'bg-white' : 'bg-slate-50/70'}`}><div className={`mb-2 flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold ${isToday ? 'bg-indigo-600 text-white' : currentMonth ? 'text-slate-700' : 'text-slate-400'}`}>{day.getDate()}</div>{dayBookings.map((booking, index) => <button type="button" key={booking.id} onClick={() => setSelectedBooking(booking)} className="mb-1 w-full rounded-md border-l-4 px-2 py-1.5 text-left text-[11px] shadow-sm transition hover:-translate-y-0.5 hover:shadow" style={{ borderLeftColor: booking.eventType.color || palette[index % palette.length], backgroundColor: booking.status === 'CONFIRMED' ? '#ecfdf5' : '#fffbeb', color: booking.status === 'CONFIRMED' ? '#166534' : '#92400e' }}><div className="truncate font-bold">{formatTime(booking.startTime)} · {booking.guestName}</div><div className="truncate opacity-80">{booking.eventType.name}</div></button>)}</div>; })}</div></CardContent></Card>
        <div className="space-y-6">{selectedBooking ? <Card className="rounded-xl border-indigo-100 shadow-sm"><CardHeader className="border-b"><div className="flex items-start justify-between"><div><CardTitle className="text-lg">Detalle de la cita</CardTitle><CardDescription>{formatTime(selectedBooking.startTime)} - {formatTime(selectedBooking.endTime)}</CardDescription></div><Button variant="ghost" size="sm" onClick={() => setSelectedBooking(null)}>Cerrar</Button></div></CardHeader><CardContent className="space-y-5 pt-5"><div><p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Tipo de evento</p><p className="mt-1 font-semibold text-slate-800">{selectedBooking.eventType.name}</p></div><div className="flex items-center gap-3"><UserRound className="h-4 w-4 text-indigo-500" /><div><p className="font-medium">{selectedBooking.guestName}</p><p className="text-sm text-slate-500">Cliente</p></div></div><div className="flex items-center gap-3"><Mail className="h-4 w-4 text-indigo-500" /><p className="text-sm text-slate-600">{selectedBooking.guestEmail}</p></div><div className="rounded-lg bg-slate-50 p-3 text-sm"><span className="font-medium">Estado: </span>{selectedBooking.status === 'CONFIRMED' ? 'Confirmada' : 'Pendiente'}</div></CardContent></Card> : <Card className="rounded-xl border-slate-200 shadow-sm"><CardHeader><CardTitle className="flex items-center gap-2"><Calendar className="h-5 w-5 text-indigo-600" />Google Calendar</CardTitle><CardDescription>Sincroniza tus reservas automáticamente</CardDescription></CardHeader><CardContent><div className="flex items-center gap-3">{calendarStatus?.connected ? <CheckCircle2 className="h-7 w-7 text-green-500" /> : <XCircle className="h-7 w-7 text-red-500" />}<div><p className="font-medium">{calendarStatus?.connected ? 'Conectado' : 'No conectado'}</p><p className="text-sm text-muted-foreground">{calendarStatus?.calendar?.summary || 'Conecta tu cuenta para sincronizar'}</p></div></div>{!calendarStatus?.connected && <Button className="mt-4 w-full" onClick={() => { window.location.href = '/api/calendar/connect'; }}>Conectar Google Calendar</Button>}</CardContent></Card>}{calendarStatus?.connected && <Card className="rounded-xl border-slate-200 shadow-sm"><CardHeader><CardTitle>Sincronización</CardTitle><CardDescription>Controla la actualización automática</CardDescription></CardHeader><CardContent><div className="flex items-center justify-between"><Label htmlFor="sync-enabled">Automática</Label><Switch id="sync-enabled" checked={syncEnabled} onCheckedChange={handleSyncToggle} disabled={updating} /></div><div className="mt-4 flex items-center gap-2 text-sm text-slate-500"><Clock className="h-4 w-4" />Las reservas se reflejan automáticamente</div></CardContent></Card>}</div>
      </div>
    </div>
  </div>;
}
