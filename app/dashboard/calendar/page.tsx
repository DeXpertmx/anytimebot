'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Calendar, CheckCircle2, XCircle, Loader2, RefreshCw, ChevronLeft, ChevronRight, Clock, Mail, UserRound, Users } from 'lucide-react';
import { toast } from 'react-hot-toast';

interface Booking { id: string; guestName: string; guestEmail: string; startTime: string; endTime: string; status: string; eventType: { name: string; color?: string }; }
interface CalendarStatus { connected: boolean; calendar?: { id: string; summary: string; timeZone: string }; }
interface Team { id: string; name: string; members: { id: string; email: string; user?: { name?: string | null; image?: string | null } | null }[]; }

const weekdays = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const palette = ['#63b3ed', '#a78bfa', '#86efac', '#f9a8d4', '#fcd34d'];
type ViewMode = 'month' | 'week' | 'day';

export default function CalendarPage() {
  const { data: session, status } = useSession() || {};
  const router = useRouter();
  const searchParams = useSearchParams();
  const [calendarStatus, setCalendarStatus] = useState<CalendarStatus | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [month, setMonth] = useState(() => new Date());
  const [selectedDay, setSelectedDay] = useState(() => new Date());
  const [view, setView] = useState<ViewMode>('month');
  const [teamId, setTeamId] = useState('all');
  const visibleBookings = teamId === 'all' ? bookings : bookings.filter((booking) => teams.find((team) => team.id === teamId)?.members.some((member) => member.email === booking.guestEmail));
  const [loading, setLoading] = useState(true);
  const [syncEnabled, setSyncEnabled] = useState(true);
  const [updating, setUpdating] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [calendarResponse, bookingResponse, teamResponse] = await Promise.all([fetch('/api/calendar/status'), fetch('/api/bookings?status=all&limit=100'), fetch('/api/teams')]);
      setCalendarStatus(await calendarResponse.json());
      const bookingData = await bookingResponse.json();
      if (bookingData.success) setBookings(bookingData.data.bookings);
      const teamData = await teamResponse.json();
      if (teamData.success) setTeams(teamData.data);
    } catch { toast.error('No se pudo cargar el calendario'); } finally { setLoading(false); }
  };

  useEffect(() => { if (status === 'unauthenticated') router.push('/auth/signin'); }, [status, router]);
  useEffect(() => { if (session) load(); }, [session]);
  useEffect(() => { if (searchParams.get('success') === 'true') { toast.success('Google Calendar conectado exitosamente'); window.history.replaceState({}, '', '/dashboard/calendar'); } }, [searchParams]);

  const monthDays = useMemo(() => { const first = new Date(month.getFullYear(), month.getMonth(), 1); const start = new Date(first); start.setDate(first.getDate() - first.getDay()); return Array.from({ length: 42 }, (_, index) => { const day = new Date(start); day.setDate(start.getDate() + index); return day; }); }, [month]);
  const weekDays = useMemo(() => { const day = new Date(selectedDay); day.setDate(day.getDate() - day.getDay()); return Array.from({ length: 7 }, (_, index) => { const value = new Date(day); value.setDate(day.getDate() + index); return value; }); }, [selectedDay]);
  const dayBookings = (day: Date) => visibleBookings.filter(b => { const date = new Date(b.startTime); return date.toDateString() === day.toDateString(); });
  const formatTime = (date: string) => new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const title = view === 'day' ? selectedDay.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : view === 'week' ? `Semana del ${weekDays[0].toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })}` : month.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
  const visibleDays = view === 'month' ? monthDays : view === 'week' ? weekDays : [selectedDay];
  const today = new Date();

  const navigate = (direction: number) => { if (view === 'month') setMonth(new Date(month.getFullYear(), month.getMonth() + direction, 1)); else { const next = new Date(selectedDay); next.setDate(selectedDay.getDate() + direction * (view === 'week' ? 7 : 1)); setSelectedDay(next); setMonth(next); } };
  const handleSyncToggle = async (enabled: boolean) => { setUpdating(true); try { const response = await fetch('/api/calendar/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ calendarSyncEnabled: enabled }) }); if (!response.ok) throw new Error(); setSyncEnabled(enabled); toast.success(enabled ? 'Sincronización activada' : 'Sincronización desactivada'); } catch { toast.error('Error al actualizar la configuración'); } finally { setUpdating(false); } };
  const selectDay = (day: Date) => { setSelectedDay(day); setMonth(day); if (view === 'month') setView('day'); };

  if (status === 'loading' || loading) return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  return <div className="min-h-[calc(100vh-4rem)] bg-slate-50/70"><div className="w-full px-2 py-2 sm:px-3 sm:py-3">
    <div className="mb-3 flex flex-wrap items-center justify-end gap-2"><div className="flex gap-2"><Button variant="outline" onClick={() => { const now = new Date(); setMonth(now); setSelectedDay(now); }}>Hoy</Button><Button variant="outline" onClick={load}><RefreshCw className="mr-2 h-4 w-4" />Actualizar</Button></div></div>
    <div className="mb-3 flex flex-wrap items-center gap-3 rounded-xl border bg-white px-4 py-2 shadow-sm"><div className="flex rounded-lg border p-1">{(['month', 'week', 'day'] as ViewMode[]).map(mode => <button key={mode} type="button" onClick={() => setView(mode)} className={`rounded-md px-4 py-2 text-sm font-medium ${view === mode ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>{mode === 'month' ? 'Mes' : mode === 'week' ? 'Semana' : 'Día'}</button>)}</div><div className="h-6 w-px bg-slate-200" /><div className="flex items-center gap-2 text-sm font-medium text-slate-700"><span className="h-3 w-3 rounded-full bg-emerald-400" />Confirmadas</div><div className="flex items-center gap-2 text-sm font-medium text-slate-700"><span className="h-3 w-3 rounded-full bg-amber-400" />Pendientes</div><div className="ml-auto flex items-center gap-2"><Users className="h-4 w-4 text-indigo-600" /><select value={teamId} onChange={e => setTeamId(e.target.value)} className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"><option value="all">Mi calendario</option>{teams.map(team => <option key={team.id} value={team.id}>{team.name}</option>)}</select><span className="text-sm text-slate-500">{visibleBookings.length} citas</span></div></div>
    <div className="grid min-h-[calc(100vh-12rem)] gap-4 xl:grid-cols-[minmax(0,1fr)_300px]"><Card className="overflow-hidden rounded-xl border-slate-200 shadow-sm"><CardHeader className="border-b bg-white px-6 py-5"><div className="flex items-center justify-between"><div><CardTitle className="flex items-center gap-2 text-xl"><Calendar className="h-5 w-5 text-indigo-600" />{view === 'day' ? 'Agenda del día' : view === 'week' ? 'Agenda semanal' : 'Vista mensual'}</CardTitle><CardDescription className="capitalize">{title}</CardDescription></div><div className="flex items-center gap-2"><Button variant="outline" size="icon" onClick={() => navigate(-1)}><ChevronLeft className="h-4 w-4" /></Button><span className="hidden min-w-44 text-center text-sm font-semibold capitalize text-slate-800 sm:inline">{title}</span><Button variant="outline" size="icon" onClick={() => navigate(1)}><ChevronRight className="h-4 w-4" /></Button></div></div></CardHeader><CardContent className="min-h-[calc(100vh-10rem)] bg-white p-2 sm:p-3">{view === 'month' ? <div className="grid grid-cols-7 overflow-hidden rounded-lg border border-slate-200 text-xs">{weekdays.map(day => <div key={day} className="border-b border-r bg-slate-50 p-3 text-center font-semibold text-slate-500">{day}</div>)}{visibleDays.map(day => { const dayItems = dayBookings(day); const currentMonth = day.getMonth() === month.getMonth(); const isToday = day.toDateString() === today.toDateString(); return <button type="button" key={day.toISOString()} onClick={() => selectDay(day)} className={`min-h-36 border-b border-r border-slate-200 p-2 text-left transition hover:bg-indigo-50/40 ${currentMonth ? 'bg-white' : 'bg-slate-50/70'}`}><div className={`mb-2 flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold ${isToday ? 'bg-indigo-600 text-white' : currentMonth ? 'text-slate-700' : 'text-slate-400'}`}>{day.getDate()}</div>{dayItems.map((booking, index) => <div key={booking.id} className="mb-1 rounded-md border-l-4 px-2 py-1.5 text-[11px] shadow-sm" style={{ borderLeftColor: booking.eventType.color || palette[index % palette.length], backgroundColor: booking.status === 'CONFIRMED' ? '#ecfdf5' : '#fffbeb', color: booking.status === 'CONFIRMED' ? '#166534' : '#92400e' }}><div className="truncate font-bold">{formatTime(booking.startTime)} · {booking.guestName}</div><div className="truncate opacity-80">{booking.eventType.name}</div></div>)}</button>; })}</div> : <div className="overflow-x-auto rounded-lg border border-slate-200"><div className={`grid min-w-[${view === 'week' ? '900px' : '400px'}]`} style={{ gridTemplateColumns: `80px repeat(${visibleDays.length}, minmax(0, 1fr))` }}><div className="border-b bg-slate-50 p-3" />{visibleDays.map(day => <button type="button" key={day.toISOString()} onClick={() => setSelectedDay(day)} className={`border-b border-l bg-slate-50 p-3 text-center ${day.toDateString() === today.toDateString() ? 'text-indigo-600' : 'text-slate-600'}`}><span className="block text-xs font-semibold uppercase">{weekdays[day.getDay()]}</span><span className="text-lg font-bold">{day.getDate()}</span></button>)}{Array.from({ length: 12 }, (_, index) => { const hour = index + 8; return <div key={hour} className="contents"><div className="min-h-24 border-b bg-slate-50 p-2 text-right text-xs text-slate-400">{hour}:00</div>{visibleDays.map(day => <div key={`${day.toISOString()}-${hour}`} className="relative min-h-24 border-b border-l border-slate-200 p-1">{dayBookings(day).filter(b => new Date(b.startTime).getHours() === hour).map(booking => <button type="button" key={booking.id} onClick={() => setSelectedBooking(booking)} className="absolute left-1 right-1 z-10 rounded-md border-l-4 p-2 text-left text-xs shadow-sm" style={{ top: `${new Date(booking.startTime).getMinutes() * 1.5}px`, borderLeftColor: booking.eventType.color || palette[0], backgroundColor: booking.status === 'CONFIRMED' ? '#dcfce7' : '#fef3c7' }}><strong className="block truncate">{booking.guestName}</strong><span className="block truncate">{formatTime(booking.startTime)} · {booking.eventType.name}</span></button>)}</div>)}</div>; })}</div></div>}</CardContent></Card>
      <div className="space-y-6">{selectedBooking ? <Card className="rounded-xl border-indigo-100 shadow-sm"><CardHeader className="border-b"><div className="flex items-start justify-between"><div><CardTitle className="text-lg">Detalle de la cita</CardTitle><CardDescription>{formatTime(selectedBooking.startTime)} - {formatTime(selectedBooking.endTime)}</CardDescription></div><Button variant="ghost" size="sm" onClick={() => setSelectedBooking(null)}>Cerrar</Button></div></CardHeader><CardContent className="space-y-5 pt-5"><div><p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Tipo de evento</p><p className="mt-1 font-semibold text-slate-800">{selectedBooking.eventType.name}</p></div><div className="flex items-center gap-3"><UserRound className="h-4 w-4 text-indigo-500" /><div><p className="font-medium">{selectedBooking.guestName}</p><p className="text-sm text-slate-500">Cliente</p></div></div><div className="flex items-center gap-3"><Mail className="h-4 w-4 text-indigo-500" /><p className="text-sm text-slate-600">{selectedBooking.guestEmail}</p></div><div className="rounded-lg bg-slate-50 p-3 text-sm"><span className="font-medium">Estado: </span>{selectedBooking.status === 'CONFIRMED' ? 'Confirmada' : 'Pendiente'}</div></CardContent></Card> : <Card className="rounded-xl border-slate-200 shadow-sm"><CardHeader><CardTitle className="flex items-center gap-2"><Calendar className="h-5 w-5 text-indigo-600" />Google Calendar</CardTitle><CardDescription>Sincroniza tus reservas automáticamente</CardDescription></CardHeader><CardContent><div className="flex items-center gap-3">{calendarStatus?.connected ? <CheckCircle2 className="h-7 w-7 text-green-500" /> : <XCircle className="h-7 w-7 text-red-500" />}<div><p className="font-medium">{calendarStatus?.connected ? 'Conectado' : 'No conectado'}</p><p className="text-sm text-muted-foreground">{calendarStatus?.calendar?.summary || 'Conecta tu cuenta para sincronizar'}</p></div></div>{!calendarStatus?.connected && <Button className="mt-4 w-full" onClick={() => { window.location.href = '/api/calendar/connect'; }}>Conectar Google Calendar</Button>}</CardContent></Card>}{calendarStatus?.connected && <Card className="rounded-xl border-slate-200 shadow-sm"><CardHeader><CardTitle>Sincronización</CardTitle><CardDescription>Controla la actualización automática</CardDescription></CardHeader><CardContent><div className="flex items-center justify-between"><Label htmlFor="sync-enabled">Automática</Label><Switch id="sync-enabled" checked={syncEnabled} onCheckedChange={handleSyncToggle} disabled={updating} /></div><div className="mt-4 flex items-center gap-2 text-sm text-slate-500"><Clock className="h-4 w-4" />Las reservas se reflejan automáticamente</div></CardContent></Card>}</div></div>
  </div></div>;
}
