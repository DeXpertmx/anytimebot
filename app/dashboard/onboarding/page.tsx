'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { TimezoneSelect } from '@/components/ui/timezone-select';
import { useToast } from '@/hooks/use-toast';

const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default function OnboardingPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [username, setUsername] = useState('');
  const [timezone, setTimezone] = useState('UTC');
  const [availability, setAvailability] = useState(days.map((_, dayOfWeek) => ({ dayOfWeek, startTime: '09:00', endTime: '17:00', isAvailable: dayOfWeek > 0 && dayOfWeek < 6 })));
  const [saving, setSaving] = useState(false);
  const [calendarConnected, setCalendarConnected] = useState(false);

  const connectCalendar = () => { window.location.href = '/api/calendar/connect'; };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const profile = await fetch('/api/user/settings', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, timezone }) });
      if (!profile.ok) throw new Error((await profile.json()).error || 'Could not save profile');
      const page = await fetch('/api/booking-pages', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'My Booking Page', slug: 'book', description: 'Schedule a meeting with me', isActive: true }) });
      if (!page.ok && page.status !== 409) throw new Error((await page.json()).error || 'Could not create booking page');
      toast({ title: 'Perfil configurado', description: 'Tu URL pública de reservas está lista.' });
      router.push('/dashboard');
      router.refresh();
    } catch (error) {
      toast({ title: 'No se pudo finalizar la configuración', description: error instanceof Error ? error.message : 'Inténtalo de nuevo.', variant: 'destructive' });
    } finally { setSaving(false); }
  };

  return <div className="mx-auto max-w-2xl space-y-6">
    <div><h1 className="text-3xl font-bold">Configura tu perfil de reservas</h1><p className="mt-2 text-gray-600">Elige tu usuario público, zona horaria y disponibilidad semanal.</p></div>
    <form onSubmit={submit} className="space-y-6 rounded-lg border bg-white p-6 shadow-sm">
      <div><Label htmlFor="onboarding-username">Usuario público</Label><Input id="onboarding-username" value={username} onChange={e => setUsername(e.target.value.toLowerCase())} placeholder="juanperez" required minLength={3} maxLength={20} /><p className="mt-1 text-sm text-gray-500">Tu URL pública comenzará con anytimebot.app/{username || 'username'}/</p></div>
      <div><Label>Zona horaria</Label><TimezoneSelect value={timezone} onValueChange={setTimezone} /></div>
      <div className="rounded border p-4"><p className="font-medium">Google Calendar</p><p className="text-sm text-gray-600">Conéctalo para mantener sincronizados tu disponibilidad y tus eventos.</p><Button type="button" variant="outline" className="mt-3" onClick={connectCalendar}>{calendarConnected ? 'Conectado' : 'Conectar Google Calendar'}</Button></div>
      <div className="space-y-3"><Label>Disponibilidad semanal</Label>{availability.map((slot, index) => <div key={slot.dayOfWeek} className="grid grid-cols-[1fr_auto_auto] items-center gap-3"><label className="flex items-center gap-2"><input type="checkbox" checked={slot.isAvailable} onChange={e => setAvailability(current => current.map((item, i) => i === index ? { ...item, isAvailable: e.target.checked } : item))} />{days[index]}</label><Input type="time" value={slot.startTime} disabled={!slot.isAvailable} onChange={e => setAvailability(current => current.map((item, i) => i === index ? { ...item, startTime: e.target.value } : item))} /><Input type="time" value={slot.endTime} disabled={!slot.isAvailable} onChange={e => setAvailability(current => current.map((item, i) => i === index ? { ...item, endTime: e.target.value } : item))} /></div>)}</div>
      <Button type="submit" disabled={saving}>{saving ? 'Guardando...' : 'Finalizar configuración'}</Button>
    </form>
  </div>;
}
