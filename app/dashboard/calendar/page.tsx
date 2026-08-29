'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Calendar, CheckCircle2, XCircle, Loader2, RefreshCw, ChevronLeft, ChevronRight, Clock } from 'lucide-react';
import { toast } from 'react-hot-toast';

interface Booking { id: string; guestName: string; guestEmail: string; startTime: string; endTime: string; status: string; eventType: { name: string }; }
interface CalendarStatus { connected: boolean; calendar?: { id: string; summary: string; timeZone: string }; error?: string; }

export default function CalendarPage() {
  const { data: session, status } = useSession() || {};
  const router = useRouter();
  const searchParams = useSearchParams();
  const [calendarStatus, setCalendarStatus] = useState<CalendarStatus | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
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
    if (searchParams.get('success') === 'true') { toast.success('¡Google Calendar conectado exitosamente!'); window.history.replaceState({}, '', '/dashboard/calendar'); }
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

  const handleSyncToggle = async (enabled: boolean) => {
    setUpdating(true);
    try { const response = await fetch('/api/calendar/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ calendarSyncEnabled: enabled }) }); if (!response.ok) throw new Error(); setSyncEnabled(enabled); toast.success(enabled ? 'Sincronización activada' : 'Sincronización desactivada'); } catch { toast.error('Error al actualizar la configuración'); } finally { setUpdating(false); }
  };

  if (status === 'loading' || loading) return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  return <div className="container mx-auto max-w-6xl px-4 py-8">
    <div className="mb-8"><h1 className="mb-2 text-3xl font-bold">Calendario</h1><p className="text-muted-foreground">Visualiza tus citas y administra la sincronización.</p></div>
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <Card><CardHeader><div className="flex items-center justify-between"><div><CardTitle className="flex items-center gap-2"><Calendar className="h-5 w-5" />Mis citas</CardTitle><CardDescription>Reservas confirmadas y pendientes</CardDescription></div><div className="flex items-center gap-2"><Button variant="outline" size="icon" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}><ChevronLeft className="h-4 w-4" /></Button><span className="min-w-36 text-center capitalize font-medium">{monthLabel}</span><Button variant="outline" size="icon" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}><ChevronRight className="h-4 w-4" /></Button><Button variant="outline" size="icon" onClick={load}><RefreshCw className="h-4 w-4" /></Button></div></div></CardHeader><CardContent><div className="grid grid-cols-7 border-l border-t text-xs"><div className="col-span-7 grid grid-cols-7">{['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'].map(day => <div key={day} className="border-b border-r p-2 text-center font-semibold text-muted-foreground">{day}</div>)}</div>{monthDays.map(day => { const dayBookings = monthBookings(day); const currentMonth = day.getMonth() === month.getMonth(); return <div key={day.toISOString()} className={`min-h-28 border-b border-r p-1 ${currentMonth ? 'bg-white' : 'bg-gray-50 text-gray-400'}`}><div className="mb-1 text-right font-medium">{day.getDate()}</div>{dayBookings.map(booking => <div key={booking.id} className={`mb-1 rounded px-1.5 py-1 text-[11px] ${booking.status === 'CONFIRMED' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}`} title={booking.guestEmail}><div className="truncate font-semibold">{formatTime(booking.startTime)} {booking.guestName}</div><div className="truncate">{booking.eventType.name}</div></div>)}</div>; })}</div></CardContent></Card>
      <div className="space-y-6"><Card><CardHeader><CardTitle className="flex items-center gap-2"><Calendar className="h-5 w-5" />Google Calendar</CardTitle><CardDescription>Sincroniza tus reservas automáticamente</CardDescription></CardHeader><CardContent><div className="flex items-center gap-3">{calendarStatus?.connected ? <CheckCircle2 className="h-7 w-7 text-green-500" /> : <XCircle className="h-7 w-7 text-red-500" />}<div><p className="font-medium">{calendarStatus?.connected ? 'Conectado' : 'No conectado'}</p><p className="text-sm text-muted-foreground">{calendarStatus?.calendar?.summary || 'Conecta tu cuenta para sincronizar'}</p></div></div>{!calendarStatus?.connected && <Button className="mt-4 w-full" onClick={() => { window.location.href = '/api/calendar/connect'; }}>Conectar Google Calendar</Button>}</CardContent></Card>{calendarStatus?.connected && <Card><CardHeader><CardTitle>Sincronización</CardTitle></CardHeader><CardContent><div className="flex items-center justify-between"><Label htmlFor="sync-enabled">Automática</Label><Switch id="sync-enabled" checked={syncEnabled} onCheckedChange={handleSyncToggle} disabled={updating} /></div><div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground"><Clock className="h-4 w-4" />Las reservas se reflejan automáticamente</div></CardContent></Card>}</div>
    </div>
  </div>;
}
