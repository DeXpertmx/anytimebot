'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Calendar, Loader2, RefreshCw, ChevronLeft, ChevronRight, Mail, UserRound, Users, X } from 'lucide-react';
import { toast } from 'react-hot-toast';

interface Booking { id: string; guestName: string; guestEmail: string; startTime: string; endTime: string; status: string; eventType: { name: string; color?: string }; }
interface Team { id: string; name: string; members: { id: string; email: string; user?: { name?: string | null; image?: string | null } | null }[]; }

const weekdays = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const palette = ['#63b3ed', '#a78bfa', '#86efac', '#f9a8d4', '#fcd34d'];
type ViewMode = 'month' | 'week' | 'day';

export default function CalendarPage() {
  const { data: session, status } = useSession() || {};
  const router = useRouter();
  const searchParams = useSearchParams();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [month, setMonth] = useState(() => new Date());
  const [selectedDay, setSelectedDay] = useState(() => new Date());
  const [view, setView] = useState<ViewMode>('month');
  const [teamId, setTeamId] = useState('all');
  const visibleBookings = teamId === 'all' ? bookings : bookings.filter((booking) => teams.find((team) => team.id === teamId)?.members.some((member) => member.email === booking.guestEmail));
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const [bookingResponse, teamResponse] = await Promise.all([fetch('/api/bookings?status=all&limit=100'), fetch('/api/teams')]);
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
  const selectDay = (day: Date) => { setSelectedDay(day); setMonth(day); if (view === 'month') setView('day'); };

  if (status === 'loading' || loading) return <div className="flex h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col overflow-hidden bg-slate-50/70">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2 shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex rounded-lg border bg-white p-1 shadow-sm">
            {(['month', 'week', 'day'] as ViewMode[]).map(mode => (
              <button key={mode} type="button" onClick={() => setView(mode)} className={`rounded-md px-4 py-1.5 text-sm font-medium transition ${view === mode ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
                {mode === 'month' ? 'Mes' : mode === 'week' ? 'Semana' : 'Día'}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3 text-sm text-slate-600">
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-emerald-400" /> Confirmadas</span>
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-amber-400" /> Pendientes</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-indigo-600" />
          <select value={teamId} onChange={e => setTeamId(e.target.value)} className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm">
            <option value="all">Mi calendario</option>
            {teams.map(team => <option key={team.id} value={team.id}>{team.name}</option>)}
          </select>
          <span className="text-sm text-slate-500">{visibleBookings.length} citas</span>
          <div className="ml-2 flex items-center gap-1">
            <Button variant="outline" size="sm" onClick={() => { const now = new Date(); setMonth(now); setSelectedDay(now); }}>Hoy</Button>
            <Button variant="outline" size="sm" onClick={load}><RefreshCw className="mr-1 h-3.5 w-3.5" />Actualizar</Button>
          </div>
        </div>
      </div>

      {/* Month navigation */}
      <div className="flex items-center justify-between px-4 py-1 shrink-0">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-800">
          <Calendar className="h-5 w-5 text-indigo-600" />{title}
        </h2>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => navigate(-1)}><ChevronLeft className="h-4 w-4" /></Button>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => navigate(1)}><ChevronRight className="h-4 w-4" /></Button>
        </div>
      </div>

      {/* Calendar grid — takes all remaining space */}
      <div className="flex-1 min-h-0 px-4 pb-2">
        {view === 'month' ? (
          <div className="flex h-full flex-col rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            {/* Weekday headers */}
            <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50">
              {weekdays.map(day => (
                <div key={day} className="px-2 py-2.5 text-center text-xs font-semibold uppercase tracking-wider text-slate-500">{day}</div>
              ))}
            </div>
            {/* Day cells — 6 rows filling the rest */}
            <div className="grid flex-1 grid-cols-7 grid-rows-6">
              {visibleDays.map(day => {
                const dayItems = dayBookings(day);
                const currentMonth = day.getMonth() === month.getMonth();
                const isToday = day.toDateString() === today.toDateString();
                return (
                  <button
                    key={day.toISOString()}
                    type="button"
                    onClick={() => selectDay(day)}
                    className={`flex flex-col border-b border-r border-slate-100 p-1.5 text-left transition hover:bg-indigo-50/40 overflow-hidden ${currentMonth ? 'bg-white' : 'bg-slate-50/50'}`}
                  >
                    <div className={`mb-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${isToday ? 'bg-indigo-600 text-white' : currentMonth ? 'text-slate-700' : 'text-slate-300'}`}>
                      {day.getDate()}
                    </div>
                    <div className="flex-1 overflow-y-auto space-y-0.5">
                      {dayItems.slice(0, 4).map((booking, index) => (
                        <div
                          key={booking.id}
                          className="truncate rounded-sm border-l-[3px] px-1 py-0.5 text-[10px] leading-tight shadow-sm"
                          style={{
                            borderLeftColor: booking.eventType.color || palette[index % palette.length],
                            backgroundColor: booking.status === 'CONFIRMED' ? '#dcfce7' : '#fef3c7',
                            color: booking.status === 'CONFIRMED' ? '#166534' : '#92400e',
                          }}
                        >
                          <span className="font-semibold">{formatTime(booking.startTime)}</span> {booking.guestName}
                        </div>
                      ))}
                      {dayItems.length > 4 && (
                        <div className="text-[10px] font-medium text-indigo-600">+{dayItems.length - 4} más</div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          /* Week / Day view */
          <div className="h-full overflow-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="grid h-full" style={{ gridTemplateColumns: `60px repeat(${visibleDays.length}, minmax(0, 1fr))` }}>
              {/* Header row */}
              <div className="sticky top-0 z-10 border-b bg-slate-50" />
              {visibleDays.map(day => (
                <div key={day.toISOString()} className={`sticky top-0 z-10 border-b border-l bg-slate-50 py-2 text-center ${day.toDateString() === today.toDateString() ? 'text-indigo-600' : 'text-slate-600'}`}>
                  <span className="block text-xs font-semibold uppercase">{weekdays[day.getDay()]}</span>
                  <span className="text-lg font-bold">{day.getDate()}</span>
                </div>
              ))}
              {/* Hour rows */}
              {Array.from({ length: 14 }, (_, index) => {
                const hour = index + 7;
                return (
                  <div key={hour} className="contents">
                    <div className="min-h-[60px] border-b bg-slate-50 px-1 pt-1 text-right text-[11px] font-medium text-slate-400">{hour}:00</div>
                    {visibleDays.map(day => (
                      <div key={`${day.toISOString()}-${hour}`} className="relative min-h-[60px] border-b border-l border-slate-100">
                        {dayBookings(day).filter(b => new Date(b.startTime).getHours() === hour).map(booking => (
                          <button
                            key={booking.id}
                            type="button"
                            onClick={() => setSelectedBooking(booking)}
                            className="absolute left-0.5 right-0.5 z-10 rounded border-l-[3px] px-1 py-0.5 text-left text-[11px] shadow-sm"
                            style={{
                              top: `${(new Date(booking.startTime).getMinutes() / 60) * 60}px`,
                              borderLeftColor: booking.eventType.color || palette[0],
                              backgroundColor: booking.status === 'CONFIRMED' ? '#dcfce7' : '#fef3c7',
                            }}
                          >
                            <strong className="block truncate text-[11px]">{booking.guestName}</strong>
                            <span className="block truncate text-[10px]">{formatTime(booking.startTime)}</span>
                          </button>
                        ))}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Detail modal */}
      {selectedBooking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b px-6 py-4">
              <h3 className="text-lg font-semibold">Detalle de la cita</h3>
              <Button variant="ghost" size="icon" onClick={() => setSelectedBooking(null)}><X className="h-4 w-4" /></Button>
            </div>
            <div className="space-y-4 px-6 py-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Tipo de evento</p>
                <p className="mt-1 font-semibold text-slate-800">{selectedBooking.eventType.name}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Horario</p>
                <p className="mt-1 text-sm text-slate-700">{formatTime(selectedBooking.startTime)} - {formatTime(selectedBooking.endTime)}</p>
              </div>
              <div className="flex items-center gap-3">
                <UserRound className="h-4 w-4 text-indigo-500" />
                <div>
                  <p className="font-medium">{selectedBooking.guestName}</p>
                  <p className="text-sm text-slate-500">Cliente</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Mail className="h-4 w-4 text-indigo-500" />
                <p className="text-sm text-slate-600">{selectedBooking.guestEmail}</p>
              </div>
              <div className="rounded-lg bg-slate-50 p-3 text-sm">
                <span className="font-medium">Estado: </span>{selectedBooking.status === 'CONFIRMED' ? 'Confirmada' : 'Pendiente'}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
