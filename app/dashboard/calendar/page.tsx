'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Banknote, Ban, Calendar, CalendarOff, Loader2, RefreshCw, ChevronLeft, ChevronRight, Mail, UserRound, Users, X, Plus, CheckCircle2, Flag, Save, Sofa, MapPin } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { TimeOffDialog } from '@/components/dashboard/availability/time-off-dialog';
import { formatBlockWindow, isWholeDayBlock } from '@/lib/time-off';
import { MANUAL_PAYMENT_METHODS, isManualPayment, paymentMethodLabel } from '@/lib/payment-methods';

/** Google Calendar event as returned by GET /api/calendar/events. */
interface GoogleEvent {
  id: string;
  summary?: string | null;
  start?: { dateTime?: string | null; date?: string | null } | null;
  end?: { dateTime?: string | null; date?: string | null } | null;
}

interface Booking {
  id: string;
  guestName: string;
  guestEmail: string;
  startTime: string;
  endTime: string;
  status: string;
  notes?: string | null;
  completedAt?: string | null;
  paymentStatus?: string | null;
  paymentMethod?: string | null;
  paymentAmount?: number | null;
  paymentCurrency?: string | null;
  /** Present only for payments collected online with Stripe. */
  stripeSessionId?: string | null;
  stripePaymentIntent?: string | null;
  resourceName?: string | null;
  locationName?: string | null;
  locationAddress?: string | null;
  eventType: { name: string; color?: string; price?: number | null; currency?: string | null; collectPayment?: boolean };
  /** Combined services (multi-service bookings): show "Corte + Barba". */
  serviceItems?: Array<{ name: string; duration: number }> | null;
  /** CRM customer matched by guest email (photo shown in the modal). */
  customer?: { name?: string | null; email?: string; photo?: string | null; company?: string | null; phone?: string | null } | null;
}
interface Team { id: string; name: string; members: { id: string; email: string; user?: { name?: string | null; image?: string | null } | null }[]; }
interface EventType { id: string; name: string; duration: number; color?: string; bookingPage: { id: string; name: string } }
interface TimeOff {
  id: string;
  name?: string | null;
  start: string;
  end: string;
  /** Whole-day absence vs. partial-hour block (stored flag). */
  allDay?: boolean | null;
  resourceId?: string | null;
  resource?: { id: string; name: string } | null;
}

const weekdays = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const palette = ['#63b3ed', '#a78bfa', '#86efac', '#f9a8d4', '#fcd34d'];
type ViewMode = 'month' | 'week' | 'day';

const bookingStatusLabel = (status: string) =>
  status === 'CONFIRMED'
    ? 'Confirmada'
    : status === 'CANCELLED'
      ? 'Cancelada'
      : status === 'COMPLETED'
        ? 'Finalizada'
        : 'Pendiente';

const bookingChipStyle = (status: string) => {
  if (status === 'CANCELLED') return { backgroundColor: '#fee2e2', color: '#991b1b', textDecoration: 'line-through' as const };
  if (status === 'COMPLETED') return { backgroundColor: '#e2e8f0', color: '#475569' };
  if (status === 'CONFIRMED') return { backgroundColor: '#dcfce7', color: '#166534' };
  return { backgroundColor: '#fef3c7', color: '#92400e' };
};

export default function CalendarPage() {
  const { data: session, status } = useSession() || {};
  const router = useRouter();
  const searchParams = useSearchParams();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [eventTypes, setEventTypes] = useState<EventType[]>([]);
  const [timeOffs, setTimeOffs] = useState<TimeOff[]>([]);
  const [googleConnected, setGoogleConnected] = useState(false);
  const [googleEvents, setGoogleEvents] = useState<GoogleEvent[]>([]);
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [guestHistory, setGuestHistory] = useState<Booking[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [month, setMonth] = useState(() => new Date());
  const [selectedDay, setSelectedDay] = useState(() => new Date());
  const [view, setView] = useState<ViewMode>('month');
  const [teamId, setTeamId] = useState('all');
  const [loading, setLoading] = useState(true);

  // New booking modal state
  const [showNewBooking, setShowNewBooking] = useState(false);
  const [newBookingDate, setNewBookingDate] = useState('');
  const [newBookingHour, setNewBookingHour] = useState('09:00');
  const [newEventTypeId, setNewEventTypeId] = useState('');
  const [newGuestName, setNewGuestName] = useState('');
  const [newGuestEmail, setNewGuestEmail] = useState('');
  const [newGuestPhone, setNewGuestPhone] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [creating, setCreating] = useState(false);
  const [refunding, setRefunding] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [bookingVersion, setBookingVersion] = useState(0);
  const [bookingNotesDraft, setBookingNotesDraft] = useState('');
  const [notesSaving, setNotesSaving] = useState(false);

  // Manual (in-person) payment: cash, card terminal, transfer, Bizum.
  const [paySaving, setPaySaving] = useState(false);
  const [payMethod, setPayMethod] = useState<string>('CASH');
  const [payAmount, setPayAmount] = useState('');
  const [payComplete, setPayComplete] = useState(true);

  // Quick "block my time" action (shared absence dialog, prefilled with a day).
  const [blockDialogOpen, setBlockDialogOpen] = useState(false);
  const [blockDialogDate, setBlockDialogDate] = useState<string | undefined>(undefined);
  const toYmd = (day: Date) =>
    `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
  const openBlockDialog = (day?: Date | string) => {
    setBlockDialogDate(typeof day === 'string' ? day : toYmd(day || selectedDay));
    setBlockDialogOpen(true);
  };

  const visibleBookings = teamId === 'all' ? bookings : bookings.filter((booking) => teams.find((team) => team.id === teamId)?.members.some((member) => member.email === booking.guestEmail));

  const eventLabel = (b: Booking) =>
    b.serviceItems && b.serviceItems.length > 1
      ? b.serviceItems.map((s) => s.name).join(' + ')
      : b.eventType.name;

  const load = async () => {
    setLoading(true);
    try {
      const [bookingRes, teamRes, eventRes, timeOffRes] = await Promise.all([
        fetch('/api/bookings?status=all&limit=100'),
        fetch('/api/teams'),
        fetch('/api/event-types'),
        fetch('/api/time-off'),
      ]);
      const bookingData = await bookingRes.json();
      if (bookingData.success) setBookings(bookingData.data.bookings);
      const teamData = await teamRes.json();
      if (teamData.success) setTeams(teamData.data);
      const eventData = await eventRes.json();
      if (eventData.success) setEventTypes(eventData.data);
      const timeOffData = await timeOffRes.json();
      if (timeOffData.success) setTimeOffs(timeOffData.data);
    } catch { toast.error('No se pudo cargar el calendario'); } finally { setLoading(false); }
  };

  useEffect(() => { if (status === 'unauthenticated') router.push('/auth/signin'); }, [status, router]);

  // Load guest history when a booking detail is opened
  useEffect(() => {
    if (!selectedBooking) { setGuestHistory([]); return; }
    let cancelled = false;
    setHistoryLoading(true);
    fetch(`/api/bookings?guestEmail=${encodeURIComponent(selectedBooking.guestEmail)}&limit=20&status=all`)
      .then((res) => res.json())
      .then((data) => { if (!cancelled && data.success) setGuestHistory(data.data.bookings || []); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setHistoryLoading(false); });
    return () => { cancelled = true; };
  }, [selectedBooking]);
  useEffect(() => { if (session) load(); }, [session]);

  // Detect whether Google Calendar is connected for this account.
  useEffect(() => {
    if (!session) return;
    fetch('/api/calendar/status')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setGoogleConnected(!!data?.connected))
      .catch(() => setGoogleConnected(false));
  }, [session]);
  // Prefill the manual-payment form whenever a different booking is opened.
  useEffect(() => {
    if (!selectedBooking) return;
    const cents = selectedBooking.paymentAmount ?? selectedBooking.eventType?.price ?? 0;
    setPayAmount(cents ? (cents / 100).toFixed(2) : '');
    setPayMethod(selectedBooking.paymentMethod && selectedBooking.paymentMethod !== 'CARD_ONLINE' ? selectedBooking.paymentMethod : 'CASH');
    setPayComplete(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBooking?.id]);
  // Sync the notes draft whenever a different booking detail is opened
  useEffect(() => {
    setBookingNotesDraft(selectedBooking?.notes ?? '');
  }, [selectedBooking?.id]);
  useEffect(() => { if (searchParams.get('success') === 'true') { toast.success('Google Calendar conectado exitosamente'); window.history.replaceState({}, '', '/dashboard/calendar'); } }, [searchParams]);

  // Fetch Google Calendar events covering the visible range (month grid adds
  // a few days before/after; week view the 7 shown days; day view just that
  // day). Only when the account has Google Calendar connected.
  useEffect(() => {
    if (!session || !googleConnected) { setGoogleEvents([]); return; }
    const from = view === 'month'
      ? new Date(month.getFullYear(), month.getMonth() - 1, 20)
      : new Date(selectedDay.getFullYear(), selectedDay.getMonth(), selectedDay.getDate() - 2);
    const to = view === 'month'
      ? new Date(month.getFullYear(), month.getMonth() + 2, 10)
      : new Date(selectedDay.getFullYear(), selectedDay.getMonth(), selectedDay.getDate() + (view === 'week' ? 9 : 2));
    let cancelled = false;
    fetch(`/api/calendar/events?startDate=${from.toISOString()}&endDate=${to.toISOString()}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (!cancelled) setGoogleEvents(Array.isArray(data?.events) ? data.events : []); })
      .catch(() => { if (!cancelled) setGoogleEvents([]); });
    return () => { cancelled = true; };
  }, [session, googleConnected, view, month, selectedDay]);

  const monthDays = useMemo(() => { const first = new Date(month.getFullYear(), month.getMonth(), 1); const start = new Date(first); start.setDate(first.getDate() - first.getDay()); return Array.from({ length: 42 }, (_, index) => { const day = new Date(start); day.setDate(start.getDate() + index); return day; }); }, [month]);
  const weekDays = useMemo(() => { const day = new Date(selectedDay); day.setDate(day.getDate() - day.getDay()); return Array.from({ length: 7 }, (_, index) => { const value = new Date(day); value.setDate(day.getDate() + index); return value; }); }, [selectedDay]);
  const dayBookings = (day: Date) => visibleBookings.filter(b => { const date = new Date(b.startTime); return date.toDateString() === day.toDateString(); });

  // --- Google Calendar overlay (read-only, visually distinct) ---------------
  const googleEventStart = (e: GoogleEvent) => new Date(e.start?.dateTime || e.start?.date || '');
  const googleEventEnd = (e: GoogleEvent) => new Date(e.end?.dateTime || e.end?.date || '');
  const dayGoogleEvents = (day: Date) =>
    googleEvents.filter((e) => {
      const s = googleEventStart(e);
      return !isNaN(s.getTime()) && s.toDateString() === day.toDateString();
    });
  // Owner-wide absences come in two shapes: whole days off (vacations — the
  // day is closed) and time ranges (lunch break — only those hours are closed).
  // Per-resource absences only close that resource (always as a small note).
  const overlapsDay = (t: TimeOff, day: Date) => {
    const start = new Date(t.start);
    const end = new Date(t.end);
    const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate());
    const dayEnd = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 23, 59, 59, 999);
    return start <= dayEnd && end >= dayStart;
  };
  const dayTimeOff = (day: Date) =>
    timeOffs.find(t => !t.resourceId && isWholeDayBlock(t) && overlapsDay(t, day));
  /** Partial-hour blocks (owner-wide) touching the day. */
  const dayHourTimeOffs = (day: Date) =>
    timeOffs.filter(t => !t.resourceId && !isWholeDayBlock(t) && overlapsDay(t, day));
  /** Partial-hour block covering a given hour of the day, if any. */
  const hourTimeOff = (day: Date, hour: number) => {
    const hourStart = new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour);
    const hourEnd = new Date(hourStart.getTime() + 60 * 60 * 1000);
    return dayHourTimeOffs(day).find(t => {
      const start = new Date(t.start);
      const end = new Date(t.end);
      return start < hourEnd && end > hourStart;
    });
  };
  const dayScopedTimeOffs = (day: Date) =>
    timeOffs.filter(t => !!t.resourceId && overlapsDay(t, day));
  const offStripe = 'repeating-linear-gradient(135deg, rgba(244,63,94,0.10) 0px, rgba(244,63,94,0.10) 8px, transparent 8px, transparent 16px)';
  const formatTime = (date: string) => new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const title = view === 'day' ? selectedDay.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : view === 'week' ? `Semana del ${weekDays[0].toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })}` : month.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
  const visibleDays = view === 'month' ? monthDays : view === 'week' ? weekDays : [selectedDay];
  const today = new Date();

  const navigate = (direction: number) => { if (view === 'month') setMonth(new Date(month.getFullYear(), month.getMonth() + direction, 1)); else { const next = new Date(selectedDay); next.setDate(selectedDay.getDate() + direction * (view === 'week' ? 7 : 1)); setSelectedDay(next); setMonth(next); } };
  const selectDay = (day: Date) => { setSelectedDay(day); setMonth(day); if (view === 'month') setView('day'); };

  // Open new booking modal with pre-filled date
  const openNewBooking = (date?: Date, hour?: number) => {
    const d = date || new Date();
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    setNewBookingDate(dateStr);
    setNewBookingHour(hour !== undefined ? `${String(hour).padStart(2, '0')}:00` : '09:00');
    setNewEventTypeId(eventTypes[0]?.id || '');
    setNewGuestName('');
    setNewGuestEmail('');
    setNewGuestPhone('');
    setNewNotes('');
    setShowNewBooking(true);
  };

  // Refund a paid booking
  const handleRefundBooking = async (booking: Booking) => {
    if (!window.confirm('¿Seguro que quieres reembolsar esta reserva al cliente? Se reembolsará el importe completo en su método de pago.')) {
      return;
    }
    setRefunding(true);
    try {
      const res = await fetch(`/api/bookings/${booking.id}/refund`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Reembolso procesado correctamente');
        setBookingVersion((v) => v + 1);
        load();
        setSelectedBooking(prev => prev ? { ...prev, paymentStatus: 'REFUNDED' } : prev);
      } else {
        toast.error(data.error || 'No se pudo procesar el reembolso');
      }
    } catch {
      toast.error('Error al procesar el reembolso');
    } finally {
      setRefunding(false);
    }
  };

  // Confirm, cancel or finish a booking from the detail modal
  const handleBookingStatus = async (booking: Booking, status: 'CONFIRMED' | 'CANCELLED' | 'COMPLETED') => {
    const message =
      status === 'CANCELLED'
        ? '¿Seguro que quieres cancelar esta cita? El cliente recibirá un aviso de cancelación.'
        : status === 'COMPLETED'
          ? '¿Marcar esta cita como finalizada? Podrás añadir notas o un resumen después.'
          : '¿Confirmar esta cita? El cliente recibirá la confirmación con los detalles.';
    if (!window.confirm(message)) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/bookings/${booking.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (data.success) {
        const toastMsg = status === 'CONFIRMED' ? 'Cita confirmada' : status === 'CANCELLED' ? 'Cita cancelada' : 'Cita finalizada';
        toast.success(toastMsg);
        setSelectedBooking(prev => prev ? { ...prev, status } : prev);
        setBookingVersion(v => v + 1);
        load();
      } else {
        toast.error(data.error || 'No se pudo actualizar la cita');
      }
    } catch {
      toast.error('Error al actualizar la cita');
    } finally {
      setActionLoading(false);
    }
  };

  // Record money collected in person (cash, card terminal, transfer, Bizum).
  // Nothing goes to Stripe: the booking is simply marked as paid and, when
  // "finalizar" is checked, closed (which emits its invoice).
  const handleRecordPayment = async () => {
    if (!selectedBooking) return;
    const raw = payAmount.trim().replace(',', '.');
    const cents = raw ? Math.round(Number(raw) * 100) : undefined;
    if (cents !== undefined && (!Number.isFinite(cents) || cents < 0)) {
      toast.error('Importe no válido');
      return;
    }
    setPaySaving(true);
    try {
      const res = await fetch(`/api/bookings/${selectedBooking.id}/payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method: payMethod, amountCents: cents, complete: payComplete }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(`Cobro registrado (${data.data.methodLabel})`);
        if (data.data.finalizeWarning) toast.error(data.data.finalizeWarning);
        setSelectedBooking(prev => prev ? {
          ...prev,
          paymentStatus: 'PAID',
          paymentMethod: payMethod,
          paymentAmount: data.data.booking?.paymentAmount ?? cents ?? prev.paymentAmount,
          paymentCurrency: data.data.booking?.paymentCurrency ?? prev.paymentCurrency,
          status: data.data.completed ? 'COMPLETED' : prev.status,
        } : prev);
        load();
      } else {
        toast.error(data.error || 'No se pudo registrar el cobro');
      }
    } catch {
      toast.error('Error al registrar el cobro');
    } finally {
      setPaySaving(false);
    }
  };

  // Annul a payment recorded by mistake (in-person payments only).
  const handleAnnullPayment = async (booking: Booking) => {
    if (!window.confirm('¿Anular el cobro registrado? La reserva quedará como no cobrada.')) {
      return;
    }
    setPaySaving(true);
    try {
      const res = await fetch(`/api/bookings/${booking.id}/payment`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        toast.success('Cobro anulado');
        setSelectedBooking(prev => prev ? { ...prev, paymentStatus: null, paymentMethod: null, paymentAmount: null, paymentCurrency: null } : prev);
        load();
      } else {
        toast.error(data.error || 'No se pudo anular el cobro');
      }
    } catch {
      toast.error('Error al anular el cobro');
    } finally {
      setPaySaving(false);
    }
  };

  // Save the host notes / meeting summary without changing the status
  const saveBookingNotes = async () => {
    if (!selectedBooking) return;
    setNotesSaving(true);
    try {
      const res = await fetch(`/api/bookings/${selectedBooking.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: selectedBooking.status,
          notes: bookingNotesDraft.trim() ? bookingNotesDraft.trim() : null,
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Notas guardadas');
        setSelectedBooking(prev => prev ? { ...prev, notes: bookingNotesDraft.trim() ? bookingNotesDraft.trim() : null } : prev);
        load();
      } else {
        toast.error(data.error || 'No se pudieron guardar las notas');
      }
    } catch {
      toast.error('Error al guardar las notas');
    } finally {
      setNotesSaving(false);
    }
  };

  // Create booking
  const handleCreateBooking = async () => {
    if (!newEventTypeId || !newGuestName || !newGuestEmail || !newBookingDate) {
      toast.error('Completa todos los campos obligatorios');
      return;
    }
    setCreating(true);
    try {
      const startTime = new Date(`${newBookingDate}T${newBookingHour}:00`);
      const res = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventTypeId: newEventTypeId,
          guestName: newGuestName,
          guestEmail: newGuestEmail,
          guestPhone: newGuestPhone || undefined,
          startTime: startTime.toISOString(),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          formData: newNotes ? { notes: newNotes } : {},
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Cita creada exitosamente');
        setShowNewBooking(false);
        // Add to local state immediately
        setBookings(prev => [...prev, data.data].sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()));
      } else {
        toast.error(data.error || 'No se pudo crear la cita');
      }
    } catch { toast.error('Error al crear la cita'); } finally { setCreating(false); }
  };

  if (status === 'loading' || loading) return <div className="flex h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="-m-4 flex min-h-[calc(100vh-4rem)] flex-col bg-slate-50/70 sm:-m-6">
      {/* Top bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 shrink-0">
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
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-rose-200" /> Ausencias</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" className="bg-indigo-600 text-white hover:bg-indigo-700" onClick={() => openNewBooking()}>
            <Plus className="mr-1 h-4 w-4" />Nueva cita
          </Button>
          <Button size="sm" variant="outline" onClick={() => openBlockDialog()} title="Bloquear fechas en las que no atiendes">
            <CalendarOff className="mr-1 h-4 w-4" />Bloquear
          </Button>
          <Users className="h-4 w-4 text-indigo-600" />
          <select value={teamId} onChange={e => setTeamId(e.target.value)} className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm">
            <option value="all">Mi calendario</option>
            {teams.map(team => <option key={team.id} value={team.id}>{team.name}</option>)}
          </select>
          <span className="text-sm text-slate-500">{visibleBookings.length} citas</span>
          {googleConnected && (
            <span
              className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-500"
              title="Los eventos con borde punteado vienen de tu Google Calendar (solo lectura)"
            >
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              Google Calendar conectado
            </span>
          )}
          <div className="ml-2 flex items-center gap-1">
            <Button variant="outline" size="sm" onClick={() => { const now = new Date(); setMonth(now); setSelectedDay(now); }}>Hoy</Button>
            <Button variant="outline" size="sm" onClick={load}><RefreshCw className="mr-1 h-3.5 w-3.5" />Actualizar</Button>
          </div>
        </div>
      </div>

      {/* Month navigation */}
      <div className="flex items-center justify-center gap-2 px-4 py-1 shrink-0">
        <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={() => navigate(-1)}><ChevronLeft className="h-4 w-4" /></Button>
        <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-800">
          <Calendar className="h-5 w-5 text-indigo-600" />{title}
        </h2>
        <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={() => navigate(1)}><ChevronRight className="h-4 w-4" /></Button>
      </div>

      {/* Calendar grid */}
      <div className="min-h-[34rem] flex-1 px-4 pb-6">
        {view === 'month' ? (
          <div className="flex min-h-[34rem] flex-col rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50">
              {weekdays.map(day => (
                <div key={day} className="px-2 py-2.5 text-center text-xs font-semibold uppercase tracking-wider text-slate-500">{day}</div>
              ))}
            </div>
            <div className="grid min-h-[30rem] flex-1 grid-cols-7 grid-rows-6">
              {visibleDays.map(day => {
                const dayItems = dayBookings(day);
                const currentMonth = day.getMonth() === month.getMonth();
                const isToday = day.toDateString() === today.toDateString();
                const off = dayTimeOff(day);
                return (
                  <button
                    key={day.toISOString()}
                    type="button"
                    onClick={() => openNewBooking(day)}
                    style={off ? { backgroundImage: offStripe } : undefined}
                    className={`flex flex-col border-b border-r border-slate-100 p-1.5 text-left transition hover:bg-indigo-50/40 overflow-hidden ${off ? 'bg-rose-50/60' : currentMonth ? 'bg-white' : 'bg-slate-50/50'}`}
                  >
                    <div className="mb-1 flex w-full items-center justify-between">
                      <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${isToday ? 'bg-indigo-600 text-white' : currentMonth ? 'text-slate-700' : 'text-slate-300'}`}>
                        {day.getDate()}
                      </div>
                      {off && (
                        <span className="ml-auto inline-flex max-w-[calc(100%-2rem)] items-center gap-1 rounded-full bg-rose-100 px-1.5 py-0.5 text-[9px] font-semibold text-rose-700" title={off.name || 'Ausencia'}>
                          🚫 {off.name || 'Ausencia'}
                        </span>
                      )}
                      {!off && dayHourTimeOffs(day).slice(0, 1).map(t => (
                        <span
                          key={t.id}
                          className="ml-auto inline-flex max-w-[calc(100%-2rem)] items-center gap-1 truncate rounded-full bg-rose-100 px-1.5 py-0.5 text-[9px] font-semibold text-rose-700"
                          title={formatBlockWindow(t)}
                        >
                          ⏱ {new Date(t.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      ))}
                      {!off && dayHourTimeOffs(day).length === 0 && dayScopedTimeOffs(day).length > 0 && (
                        <span
                          className="ml-auto inline-flex max-w-[calc(100%-2rem)] items-center gap-1 truncate rounded-full bg-violet-100 px-1.5 py-0.5 text-[9px] font-semibold text-violet-700"
                          title={dayScopedTimeOffs(day).map(s => s.resource?.name || s.name || 'Recurso').join(', ')}
                        >
                          {dayScopedTimeOffs(day)[0].resource?.name || 'Recurso'}
                        </span>
                      )}
                    </div>
                    <div className="flex-1 overflow-y-auto space-y-0.5">
                      {dayItems.slice(0, 4).map((booking, index) => (
                        <button
                          key={booking.id}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedBooking(booking);
                          }}
                          className="block w-full truncate rounded-sm border-l-[3px] px-1 py-0.5 text-left text-[10px] leading-tight shadow-sm hover:brightness-95"
                          style={{
                            borderLeftColor: booking.eventType.color || palette[index % palette.length],
                            ...bookingChipStyle(booking.status),
                          }}
                        >
                          <span className="font-semibold">{formatTime(booking.startTime)}</span> {booking.guestName}
                        </button>
                      ))}
                      {dayItems.length > 4 && (
                        <div className="text-[10px] font-medium text-indigo-600">+{dayItems.length - 4} más</div>
                      )}
                      {/* Google Calendar overlay: read-only, visually distinct. */}
                      {dayGoogleEvents(day).slice(0, Math.max(0, 3 - Math.min(dayItems.length, 4))).map((gEvent) => (
                        <div
                          key={`g-${gEvent.id}`}
                          className="block w-full truncate rounded-sm border border-dashed border-slate-300 bg-slate-50/80 px-1 py-0.5 text-left text-[10px] leading-tight text-slate-500"
                          title={`${gEvent.summary || '(sin título)'} · evento de Google Calendar (solo lectura)`}
                        >
                          <span className="font-semibold">{!isNaN(googleEventStart(gEvent).getTime()) ? formatTime(googleEventStart(gEvent).toISOString()) : ''}</span>{' '}
                          {gEvent.summary || '(sin título)'}
                        </div>
                      ))}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          /* Week / Day view */
          <div className="min-h-[34rem] overflow-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="grid h-full" style={{ gridTemplateColumns: `60px repeat(${visibleDays.length}, minmax(0, 1fr))` }}>
              <div className="sticky top-0 z-10 border-b bg-slate-50" />
              {visibleDays.map(day => (
                <div key={day.toISOString()} className={`sticky top-0 z-10 border-b border-l bg-slate-50 py-2 text-center ${day.toDateString() === today.toDateString() ? 'text-indigo-600' : 'text-slate-600'}`}>
                  <span className="block text-xs font-semibold uppercase">{weekdays[day.getDay()]}</span>
                  <span className="text-lg font-bold">{day.getDate()}</span>
                  {/* In day view there is room for a one-click block action. */}
                  {visibleDays.length === 1 && (
                    <button
                      type="button"
                      onClick={() => openBlockDialog(day)}
                      className="mt-1 inline-flex items-center gap-1 rounded-full border border-rose-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-rose-600 hover:bg-rose-50"
                    >
                      <CalendarOff className="h-3 w-3" />
                      Bloquear
                    </button>
                  )}
                </div>
              ))}
              {Array.from({ length: 14 }, (_, index) => {
                const hour = index + 7;
                return (
                  <div key={hour} className="contents">
                    <div className="min-h-[60px] border-b bg-slate-50 px-1 pt-1 text-right text-[11px] font-medium text-slate-400">{hour}:00</div>
                    {visibleDays.map(day => (
                      <div
                        key={`${day.toISOString()}-${hour}`}
                        className={`relative min-h-[60px] border-b border-l border-slate-100 cursor-pointer ${dayTimeOff(day) || hourTimeOff(day, hour) ? 'bg-rose-50/40' : 'hover:bg-indigo-50/30'}`}
                        style={dayTimeOff(day) ? { backgroundImage: offStripe } : undefined}
                        onClick={(e) => { e.stopPropagation(); openNewBooking(day, hour); }}
                      >
                        {hour === 7 && (dayTimeOff(day) || dayScopedTimeOffs(day).length > 0) && (
                          <div className="absolute left-1 right-1 top-1 z-10 flex flex-col gap-0.5">
                            {dayTimeOff(day) && (
                              <span className="truncate rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700" title={dayTimeOff(day)!.name || 'Ausencia'}>
                                🚫 {dayTimeOff(day)!.name || 'Ausencia'}
                              </span>
                            )}
                            {dayScopedTimeOffs(day).map(s => (
                              <span
                                key={s.id}
                                className="truncate rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700"
                                title={`Ausencia de recurso: ${s.resource?.name || s.name || ''}`}
                              >
                                {s.resource?.name || s.name || 'Recurso'}
                              </span>
                            ))}
                          </div>
                        )}
                        {/* Partial-hour block: labelled where it starts. */}
                        {(() => {
                          const partial = dayHourTimeOffs(day).find(t => new Date(t.start).getHours() === hour);
                          if (!partial) return null;
                          return (
                            <span
                              className="absolute left-1 right-1 top-1 z-20 truncate rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700"
                              title={`Bloqueado: ${formatBlockWindow(partial)}`}
                            >
                              ⏱ {formatBlockWindow(partial)}
                            </span>
                          );
                        })()}
                        {dayBookings(day).filter(b => new Date(b.startTime).getHours() === hour).map(booking => (
                          <button
                            key={booking.id}
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setSelectedBooking(booking); }}
                            className="absolute left-0.5 right-0.5 z-10 rounded border-l-[3px] px-1 py-0.5 text-left text-[11px] shadow-sm"
                            style={{
                              top: `${(new Date(booking.startTime).getMinutes() / 60) * 60}px`,
                              borderLeftColor: booking.eventType.color || palette[0],
                              ...bookingChipStyle(booking.status),
                            }}
                          >
                            <strong className="block truncate text-[11px]">{booking.guestName}</strong>
                            <span className="block truncate text-[10px]">{formatTime(booking.startTime)}</span>
                          </button>
                        ))}
                        {/* Google Calendar overlay for this hour. */}
                        {dayGoogleEvents(day)
                          .filter((gEvent) => {
                            const s = googleEventStart(gEvent);
                            return !isNaN(s.getTime()) && s.getHours() === hour;
                          })
                          .map((gEvent) => (
                            <div
                              key={`g-${gEvent.id}`}
                              className="absolute left-0.5 right-0.5 z-0 truncate rounded border border-dashed border-slate-300 bg-slate-50/80 px-1 py-0.5 text-[10px] text-slate-500"
                              style={{ top: `${(googleEventStart(gEvent).getMinutes() / 60) * 60}px` }}
                              title={`${gEvent.summary || '(sin título)'} · evento de Google Calendar (solo lectura)`}
                            >
                              {gEvent.summary || '(sin título)'}
                            </div>
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

      {/* Quick absence / block creation (whole day or a few hours) */}
      <TimeOffDialog
        open={blockDialogOpen}
        onOpenChange={setBlockDialogOpen}
        defaultDate={blockDialogDate}
        onCreated={load}
      />

      {/* Detail modal — existing booking */}
      {selectedBooking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setSelectedBooking(null)}>
          <div className="w-full max-w-md rounded-xl bg-white shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b px-6 py-4">
              <h3 className="text-lg font-semibold">Detalle de la cita</h3>
              <Button variant="ghost" size="icon" onClick={() => setSelectedBooking(null)}><X className="h-4 w-4" /></Button>
            </div>
            <div className="space-y-4 px-6 py-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Tipo de evento</p>
                <p className="mt-1 font-semibold text-slate-800">{eventLabel(selectedBooking)}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Horario</p>
                <p className="mt-1 text-sm text-slate-700">{formatTime(selectedBooking.startTime)} - {formatTime(selectedBooking.endTime)}</p>
              </div>
              <div className="flex items-center gap-3">
                {selectedBooking.customer?.photo ? (
                  <img
                    src={selectedBooking.customer.photo}
                    alt={selectedBooking.guestName || 'Cliente'}
                    className="h-10 w-10 rounded-full object-cover ring-2 ring-indigo-100"
                  />
                ) : (
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-100 text-indigo-600">
                    <UserRound className="h-5 w-5" />
                  </div>
                )}
                <div>
                  <p className="font-medium">{selectedBooking.guestName}</p>
                  <p className="text-sm text-slate-500">Cliente</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Mail className="h-4 w-4 text-indigo-500" />
                <p className="text-sm text-slate-600">{selectedBooking.guestEmail}</p>
              </div>
              {selectedBooking.customer?.company && (
                <p className="-mt-2 text-xs text-slate-500">
                  {selectedBooking.customer.company}
                </p>
              )}
              {(selectedBooking.resourceName || selectedBooking.locationName) && (
                <div className="rounded-lg border border-indigo-100 bg-indigo-50/60 p-3">
                  <p className="flex items-center text-sm font-semibold text-indigo-900">
                    <Sofa className="h-4 w-4 mr-2 text-indigo-500" />
                    {selectedBooking.resourceName || 'Recurso asignado'}
                  </p>
                  {(selectedBooking.locationName || selectedBooking.locationAddress) && (
                    <p className="mt-1 flex items-center text-xs text-indigo-700/80">
                      <MapPin className="h-3.5 w-3.5 mr-1.5" />
                      {[selectedBooking.locationName, selectedBooking.locationAddress].filter(Boolean).join(' · ')}
                    </p>
                  )}
                </div>
              )}
              <div className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 p-3 text-sm">
                <span>
                  <span className="font-medium">Estado: </span>
                  {bookingStatusLabel(selectedBooking.status)}
                </span>
                {selectedBooking.status !== 'CANCELLED' && selectedBooking.status !== 'COMPLETED' && (
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    {selectedBooking.status === 'PENDING' && (
                      <Button
                        size="sm"
                        className="bg-emerald-600 text-white hover:bg-emerald-700"
                        disabled={actionLoading}
                        onClick={() => handleBookingStatus(selectedBooking, 'CONFIRMED')}
                      >
                        {actionLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                        Confirmar
                      </Button>
                    )}
                    {selectedBooking.status === 'CONFIRMED' && (
                      <Button
                        size="sm"
                        className="bg-indigo-600 text-white hover:bg-indigo-700"
                        disabled={actionLoading}
                        onClick={() => handleBookingStatus(selectedBooking, 'COMPLETED')}
                      >
                        {actionLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Flag className="h-3.5 w-3.5" />}
                        Finalizar
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-rose-200 text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                      disabled={actionLoading}
                      onClick={() => handleBookingStatus(selectedBooking, 'CANCELLED')}
                    >
                      {actionLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
                      Cancelar
                    </Button>
                  </div>
                )}
              </div>

              {/* Notes & meeting summary */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Notas y resumen de la reunión</p>
                <textarea
                  value={bookingNotesDraft}
                  onChange={(e) => setBookingNotesDraft(e.target.value)}
                  rows={3}
                  placeholder="Escribe lo sucedido, acuerdos o un resumen de la cita..."
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none resize-none"
                />
                <div className="mt-2 flex justify-end">
                  <Button size="sm" variant="outline" disabled={notesSaving} onClick={saveBookingNotes}>
                    {notesSaving ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1 h-3.5 w-3.5" />}
                    Guardar notas
                  </Button>
                </div>
              </div>

              {/* Cobro: online (Stripe) o registrado en el local */}
              <div className="rounded-lg border p-3 text-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Cobro</p>

                {selectedBooking.paymentStatus && selectedBooking.paymentStatus !== 'PENDING' ? (
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <span className="flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          selectedBooking.paymentStatus === 'PAID'
                            ? 'bg-emerald-100 text-emerald-700'
                            : selectedBooking.paymentStatus === 'REFUNDED'
                              ? 'bg-rose-100 text-rose-700'
                              : 'bg-amber-100 text-amber-700'
                        }`}
                      >
                        {selectedBooking.paymentStatus === 'PAID'
                          ? 'Pagada'
                          : selectedBooking.paymentStatus === 'REFUNDED'
                            ? 'Reembolsada'
                            : selectedBooking.paymentStatus}
                      </span>
                      {selectedBooking.paymentStatus === 'PAID' && selectedBooking.paymentMethod && (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                          {paymentMethodLabel(selectedBooking.paymentMethod)}
                        </span>
                      )}
                      {selectedBooking.paymentAmount != null && (
                        <span className="font-semibold text-slate-800">
                          {(selectedBooking.paymentAmount / 100).toFixed(2)} {selectedBooking.paymentCurrency?.toUpperCase()}
                        </span>
                      )}
                    </span>
                    {selectedBooking.paymentStatus === 'PAID' &&
                      (isManualPayment(selectedBooking) ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-slate-200 text-slate-600 hover:bg-slate-50"
                          disabled={paySaving}
                          onClick={() => handleAnnullPayment(selectedBooking)}
                        >
                          {paySaving ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Ban className="mr-1 h-3.5 w-3.5" />}
                          Anular cobro
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-rose-200 text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                          disabled={refunding}
                          onClick={() => handleRefundBooking(selectedBooking)}
                        >
                          {refunding ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1 h-3.5 w-3.5" />}
                          Reembolsar
                        </Button>
                      ))}
                  </div>
                ) : (
                  <div className="mt-2 space-y-2">
                    <p className="text-xs text-slate-500">
                      Registra aquí el cobro en efectivo, con tarjeta en el local, por transferencia o Bizum. No pasa por Stripe.
                    </p>
                    <div className="flex items-center gap-2">
                      <select
                        value={payMethod}
                        onChange={(e) => setPayMethod(e.target.value)}
                        className="flex-1 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm"
                      >
                        {MANUAL_PAYMENT_METHODS.map((method) => (
                          <option key={method} value={method}>
                            {paymentMethodLabel(method)}
                          </option>
                        ))}
                      </select>
                      <div className="flex items-center gap-1">
                        <input
                          value={payAmount}
                          onChange={(e) => setPayAmount(e.target.value)}
                          inputMode="decimal"
                          placeholder="0,00"
                          className="w-20 rounded-md border border-slate-200 px-2 py-1.5 text-sm"
                        />
                        <span className="text-xs font-semibold text-slate-500">
                          {(selectedBooking.paymentCurrency || selectedBooking.eventType?.currency || 'EUR').toUpperCase()}
                        </span>
                      </div>
                    </div>
                    <label className="flex items-center gap-2 text-xs text-slate-600">
                      <input
                        type="checkbox"
                        checked={payComplete}
                        onChange={(e) => setPayComplete(e.target.checked)}
                        className="h-3.5 w-3.5 rounded border-slate-300"
                      />
                      Finalizar la cita y emitir la factura
                    </label>
                    <Button
                      size="sm"
                      className="w-full bg-emerald-600 text-white hover:bg-emerald-700"
                      disabled={paySaving}
                      onClick={handleRecordPayment}
                    >
                      {paySaving ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Banknote className="mr-1 h-3.5 w-3.5" />}
                      Registrar cobro
                    </Button>
                  </div>
                )}

                {selectedBooking.paymentStatus === 'REFUNDED' && (
                  <p className="mt-1 text-xs text-slate-500">Se devolvió el importe completo al método de pago del cliente.</p>
                )}
              </div>

              {/* Customer history */}
              <div className="border-t pt-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Historial del cliente</p>
                {historyLoading ? (
                  <div className="mt-2 flex items-center gap-2 text-sm text-slate-500">
                    <Loader2 className="h-4 w-4 animate-spin" /> Cargando...
                  </div>
                ) : guestHistory.length === 0 ? (
                  <p className="mt-2 text-sm text-slate-500">Sin citas anteriores</p>
                ) : (
                  <ul className="mt-2 max-h-44 space-y-1.5 overflow-y-auto pr-1">
                    {guestHistory.map((item) => (
                      <li
                        key={item.id}
                        className={`flex items-center justify-between gap-2 rounded-md px-3 py-1.5 text-sm ${
                          item.id === selectedBooking.id ? 'bg-indigo-50 ring-1 ring-indigo-200' : 'bg-slate-50'
                        }`}
                      >
                        <span className="min-w-0 flex-1 truncate font-medium text-slate-800">{eventLabel(item)}</span>
                        <span className="shrink-0 text-xs text-slate-500">
                          {new Date(item.startTime).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </span>
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                            item.status === 'CONFIRMED'
                              ? 'bg-emerald-100 text-emerald-700'
                              : item.status === 'CANCELLED'
                                ? 'bg-rose-100 text-rose-700'
                                : item.status === 'COMPLETED'
                                  ? 'bg-slate-200 text-slate-600'
                                  : 'bg-amber-100 text-amber-700'
                          }`}
                        >
                          {bookingStatusLabel(item.status)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* New booking modal */}
      {showNewBooking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowNewBooking(false)}>
          <div className="w-full max-w-lg rounded-xl bg-white shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b px-6 py-4">
              <h3 className="text-lg font-semibold">Nueva cita</h3>
              <Button variant="ghost" size="icon" onClick={() => setShowNewBooking(false)}><X className="h-4 w-4" /></Button>
            </div>
            <div className="space-y-4 px-6 py-4">
              {/* Event type */}
              <div>
                <label className="text-sm font-medium text-slate-700">Tipo de evento *</label>
                <select value={newEventTypeId} onChange={e => setNewEventTypeId(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none">
                  <option value="">Seleccionar evento</option>
                  {eventTypes.map(et => (
                    <option key={et.id} value={et.id}>{et.name} ({et.duration} min)</option>
                  ))}
                </select>
              </div>

              {/* Guest name & email */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium text-slate-700">Nombre del cliente *</label>
                  <input type="text" value={newGuestName} onChange={e => setNewGuestName(e.target.value)} placeholder="Juan Pérez" className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none" />
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700">Email del cliente *</label>
                  <input type="email" value={newGuestEmail} onChange={e => setNewGuestEmail(e.target.value)} placeholder="juan@ejemplo.com" className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none" />
                </div>
              </div>

              {/* Phone */}
              <div>
                <label className="text-sm font-medium text-slate-700">Teléfono (opcional)</label>
                <input type="tel" value={newGuestPhone} onChange={e => setNewGuestPhone(e.target.value)} placeholder="+52 123 456 7890" className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none" />
              </div>

              {/* Date & time */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium text-slate-700">Fecha *</label>
                  <input type="date" value={newBookingDate} onChange={e => setNewBookingDate(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none" />
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700">Hora *</label>
                  <input type="time" value={newBookingHour} onChange={e => setNewBookingHour(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none" />
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="text-sm font-medium text-slate-700">Notas (opcional)</label>
                <textarea value={newNotes} onChange={e => setNewNotes(e.target.value)} rows={2} placeholder="Notas internas sobre la cita..." className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none resize-none" />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 border-t px-6 py-4">
              <Button variant="outline" onClick={() => setShowNewBooking(false)}>Cancelar</Button>
              <Button className="bg-indigo-600 text-white hover:bg-indigo-700" onClick={handleCreateBooking} disabled={creating}>
                {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                Crear cita
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
