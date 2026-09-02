
'use client';

import { Fragment, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { isValidUsername } from '@/lib/utils';
import { Save, Loader2, Globe, Calendar, Clock, Copy, Plus, Trash2, Wand2 } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface AvailabilitySlot {
  id?: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  isAvailable: boolean;
}  interface EditBookingPageFormProps {
  bookingPage: {
    id: string;
    title: string;
    slug: string;
    description?: string;
    isActive: boolean;
    slotInterval?: number;
    brandColor?: string;
    logoUrl?: string | null;
    eventTypes: any[];
    availability: AvailabilitySlot[];
  };
}

const DAYS_OF_WEEK = [
  { value: 0, label: 'Domingo' },
  { value: 1, label: 'Lunes' },
  { value: 2, label: 'Martes' },
  { value: 3, label: 'Miércoles' },
  { value: 4, label: 'Jueves' },
  { value: 5, label: 'Viernes' },
  { value: 6, label: 'Sábado' },
];

// Spanish weekly order (Monday first) for grouping and defaults
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

const TIME_SLOTS = Array.from({ length: 48 }, (_, i) => {
  const hour = Math.floor(i / 2);
  const minute = i % 2 === 0 ? '00' : '30';
  const time24 = `${hour.toString().padStart(2, '0')}:${minute}`;
  return time24;
});

// Quick templates: clicking one replaces the current schedule in one go.
// End times use the half-hour grid of TIME_SLOTS so rows stay editable.
const AVAILABILITY_PRESETS: { id: string; label: string; slots: AvailabilitySlot[] }[] = [
  {
    id: 'weekdays-9-17',
    label: 'Lun–Vie · 9:00–17:00',
    slots: [1, 2, 3, 4, 5].map((dayOfWeek) => ({
      dayOfWeek,
      startTime: '09:00',
      endTime: '17:00',
      isAvailable: true,
    })),
  },
  {
    id: 'weekend-10-14',
    label: 'Fin de semana · 10:00–14:00',
    slots: [6, 0].map((dayOfWeek) => ({
      dayOfWeek,
      startTime: '10:00',
      endTime: '14:00',
      isAvailable: true,
    })),
  },
  {
    id: 'always',
    label: '24/7',
    slots: [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
      dayOfWeek,
      startTime: '00:00',
      endTime: '23:30',
      isAvailable: true,
    })),
  },
];

export function EditBookingPageForm({ bookingPage }: EditBookingPageFormProps) {
  const [formData, setFormData] = useState({
    title: bookingPage.title,
    slug: bookingPage.slug,
    description: bookingPage.description || '',
    isActive: bookingPage.isActive,
    slotInterval: bookingPage.slotInterval || 15,
    brandColor: (bookingPage as any).brandColor || '#6366f1',
    logoUrl: (bookingPage as any).logoUrl || '',
  });
  const [availability, setAvailability] = useState<AvailabilitySlot[]>(
    bookingPage.availability.length > 0
      ? bookingPage.availability
      : [
          { dayOfWeek: 1, startTime: '09:00', endTime: '17:00', isAvailable: true },
          { dayOfWeek: 2, startTime: '09:00', endTime: '17:00', isAvailable: true },
          { dayOfWeek: 3, startTime: '09:00', endTime: '17:00', isAvailable: true },
          { dayOfWeek: 4, startTime: '09:00', endTime: '17:00', isAvailable: true },
          { dayOfWeek: 5, startTime: '09:00', endTime: '17:00', isAvailable: true },
        ]
  );
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const router = useRouter();

  // Add a new range to a specific day. If the day already has ranges, the
  // new one chains after the last end time (9–14 → 14–15:30) so split
  // shifts like 9–14 / 15–17 are quick to set up.
  const addRangeToDay = (dayOfWeek: number) => {
    const daySlots = availability
      .filter((s) => s.dayOfWeek === dayOfWeek)
      .sort((a, b) => a.startTime.localeCompare(b.startTime));

    const formatMinutes = (minutes: number) =>
      `${Math.floor(minutes / 60)
        .toString()
        .padStart(2, '0')}:${(minutes % 60).toString().padStart(2, '0')}`;

    if (daySlots.length === 0) {
      setAvailability([
        ...availability,
        { dayOfWeek, startTime: '09:00', endTime: '17:00', isAvailable: true },
      ]);
      return;
    }

    const last = daySlots[daySlots.length - 1];
    const [h, m] = last.endTime.split(':').map(Number);
    const startMinutes = h * 60 + m;
    if (startMinutes >= 22 * 60) {
      setAvailability([
        ...availability,
        { dayOfWeek, startTime: '22:00', endTime: '23:30', isAvailable: true },
      ]);
      return;
    }
    const endMinutes = Math.min(startMinutes + 90, 23 * 60 + 30);
    setAvailability([
      ...availability,
      {
        dayOfWeek,
        startTime: last.endTime,
        endTime: formatMinutes(endMinutes),
        isAvailable: true,
      },
    ]);
  };

  const addAvailabilitySlot = () => {
    const firstFreeDay = WEEK_ORDER.find(
      (day) => !availability.some((s) => s.dayOfWeek === day)
    );
    addRangeToDay(firstFreeDay ?? 1);
  };

  const removeAvailabilitySlot = (index: number) => {
    setAvailability(availability.filter((_, i) => i !== index));
  };

  const updateAvailabilitySlot = (
    index: number,
    field: keyof AvailabilitySlot,
    value: any
  ) => {
    const updated = [...availability];
    updated[index] = { ...updated[index], [field]: value };
    setAvailability(updated);
  };

  const applyAvailabilityPreset = (presetId: string) => {
    const preset = AVAILABILITY_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    setAvailability(preset.slots.map((slot) => ({ ...slot })));
    toast({
      title: 'Disponibilidad actualizada',
      description: `Plantilla aplicada: ${preset.label}`,
    });
  };

  // Copy one row's time range onto other days of the week
  const [copyFrom, setCopyFrom] = useState<number | null>(null);
  const [copyDays, setCopyDays] = useState<number[]>([]);

  const openCopyPanel = (index: number) => {
    setCopyFrom(index);
    setCopyDays([]);
  };

  const closeCopyPanel = () => setCopyFrom(null);

  const toggleCopyDay = (dayOfWeek: number) => {
    setCopyDays((current) =>
      current.includes(dayOfWeek)
        ? current.filter((d) => d !== dayOfWeek)
        : [...current, dayOfWeek]
    );
  };

  const applyCopyToDays = () => {
    if (copyFrom === null) return;
    const source = availability[copyFrom];
    if (!source || copyDays.length === 0) {
      closeCopyPanel();
      return;
    }
    setAvailability((current) => {
      const kept = current.filter((s) => !copyDays.includes(s.dayOfWeek));
      const added = copyDays.map((dayOfWeek) => ({ ...source, dayOfWeek }));
      // Keep the list tidy: group by day (Sunday first, as in the selects)
      return [...kept, ...added].sort(
        (a, b) =>
          a.dayOfWeek - b.dayOfWeek || a.startTime.localeCompare(b.startTime)
      );
    });
    toast({
      title: 'Horario copiado',
      description: `Se aplicó ${source.startTime}–${source.endTime} a ${copyDays.length} día(s).`,
    });
    closeCopyPanel();
  };

  // Rows grouped per day (Monday first, chronologically within the day)
  const groupedAvailability = WEEK_ORDER.map((dayOfWeek) => ({
    dayOfWeek,
    label: DAYS_OF_WEEK.find((d) => d.value === dayOfWeek)?.label ?? '',
    slots: availability
      .map((slot, index) => ({ slot, index }))
      .filter(({ slot }) => slot.dayOfWeek === dayOfWeek)
      .sort((a, b) => a.slot.startTime.localeCompare(b.slot.startTime)),
  })).filter((group) => group.slots.length > 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Validation
      if (!formData.title.trim() || !formData.slug.trim()) {
        toast({
          title: 'Error',
          description: 'Title and slug are required',
          variant: 'destructive',
        });
        setLoading(false);
        return;
      }

      if (!isValidUsername(formData.slug)) {
        toast({
          title: 'Error',
          description: 'Slug can only contain letters, numbers, hyphens, and underscores',
          variant: 'destructive',
        });
        setLoading(false);
        return;
      }

      // Validate availability
      if (availability.length === 0) {
        toast({
          title: 'Error',
          description: 'Please add at least one availability slot',
          variant: 'destructive',
        });
        setLoading(false);
        return;
      }

      // Update booking page
      const response = await fetch(`/api/booking-pages/${bookingPage.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ...formData, availability }),
      });

      const data = await response.json();

      if (data.success) {
        toast({
          title: 'Success',
          description: 'Booking page updated successfully',
        });
        router.refresh();
      } else {
        toast({
          title: 'Error',
          description: data.error || 'Failed to update booking page',
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Something went wrong',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 min-w-0">
      {/* Page Statistics */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="flex items-center p-6">
            <div className="flex items-center">
              <Globe className="h-8 w-8 text-indigo-600 mr-4" />
              <div>
                <p className="text-sm font-medium text-gray-600">Estado</p>
                <Badge variant={formData.isActive ? 'default' : 'secondary'} className="mt-1">
                  {formData.isActive ? 'Activa' : 'Inactiva'}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="flex items-center p-6">
            <div className="flex items-center">
              <Calendar className="h-8 w-8 text-green-600 mr-4" />
              <div>
                <p className="text-sm font-medium text-gray-600">Tipos de eventos</p>
                <p className="text-2xl font-bold text-gray-900">{bookingPage.eventTypes.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="flex items-center p-6">
            <div className="flex items-center">
              <Clock className="h-8 w-8 text-blue-600 mr-4" />
              <div>
                <p className="text-sm font-medium text-gray-600">Availability</p>
                <p className="text-2xl font-bold text-gray-900">{availability.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Edit Form */}
        <Card>
          <CardHeader>
            <CardTitle>Configuración de la página</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="title">Título de la página</Label>
              <Input
                id="title"
                placeholder="ej., Agenda una reunión conmigo"
                value={formData.title}
                onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                required
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="slug">Slug de la URL</Label>
              <div className="flex items-center">
                <span className="text-sm text-gray-500 mr-1">
                  {typeof window !== 'undefined' ? window.location.origin : ''}/username/
                </span>
                <Input
                  id="slug"
                  placeholder="your-page"
                  value={formData.slug}
                  onChange={(e) => setFormData(prev => ({ ...prev, slug: e.target.value }))}
                  required
                />
              </div>
              <p className="text-xs text-gray-500">
                Esta será la URL de tu página de reserva. Usa solo letras, números, guiones y guiones bajos.
              </p>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="description">Descripción (opcional)</Label>
              <Textarea
                id="description"
                placeholder="Indica a tus clientes qué pueden reservar..."
                rows={4}
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              />
            </div>
            
            <div className="grid grid-cols-1 gap-4 rounded-md border border-gray-200 p-4">
              <p className="text-sm font-medium text-gray-900">Personalización de marca</p>
              <div className="space-y-2">
                <Label htmlFor="brand-color">Color de marca</Label>
                <div className="flex items-center gap-2">
                  <input
                    id="brand-color"
                    type="color"
                    value={formData.brandColor}
                    onChange={(e) => setFormData(prev => ({ ...prev, brandColor: e.target.value }))}
                    className="h-9 w-12 cursor-pointer rounded border border-gray-300 bg-white p-0.5"
                  />
                  <Input
                    value={formData.brandColor}
                    onChange={(e) => setFormData(prev => ({ ...prev, brandColor: e.target.value }))}
                    className="font-mono"
                    placeholder="#6366f1"
                  />
                </div>
                <p className="text-xs text-gray-500">
                  Color de acento de tu página pública de reserva (botones, enlaces y detalles).
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="logo-url">URL del logotipo (opcional)</Label>
                <Input
                  id="logo-url"
                  placeholder="https://tu-dominio.com/logo.png"
                  value={formData.logoUrl}
                  onChange={(e) => setFormData(prev => ({ ...prev, logoUrl: e.target.value }))}
                />
                <p className="text-xs text-gray-500">
                  Si lo dejas vacío se usa el logotipo de Anytimebot.
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="slotInterval">Time Slot Interval</Label>
              <Select
                value={formData.slotInterval.toString()}
                onValueChange={(value) => 
                  setFormData(prev => ({ ...prev, slotInterval: parseInt(value) }))
                }
              >
                <SelectTrigger id="slotInterval">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="15">15 minutos</SelectItem>
                  <SelectItem value="30">30 minutos</SelectItem>
                  <SelectItem value="60">60 minutos</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-500">
                Los horarios disponibles se mostrarán en intervalos de este tiempo
              </p>
            </div>

            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div className="space-y-0.5">
                <Label htmlFor="is-active" className="text-base">Estado activo</Label>
                <p className="text-sm text-gray-500">
                  Haz que esta página esté disponible para reservas
                </p>
              </div>
              <Switch
                id="is-active"
                checked={formData.isActive}
                onCheckedChange={(checked) => 
                  setFormData(prev => ({ ...prev, isActive: checked }))
                }
              />
            </div>
          </CardContent>
        </Card>

        {/* Availability Settings */}
        <Card className="overflow-hidden">
          <CardHeader>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <CardTitle>Horario de disponibilidad</CardTitle>
                <p className="text-sm text-gray-600 mt-1">
                  Configura tu horario laboral para esta página de reserva
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addAvailabilitySlot}
              >
                <Plus className="h-4 w-4 mr-2" />
                Añadir horario
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {/* Quick presets */}
            <div className="mb-5 rounded-lg border border-indigo-100 bg-indigo-50/60 p-3">
              <p className="text-xs font-semibold text-indigo-700 mb-2">
                Plantillas rápidas
              </p>
              <div className="flex flex-wrap gap-2">
                {AVAILABILITY_PRESETS.map((preset) => (
                  <Button
                    key={preset.id}
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => applyAvailabilityPreset(preset.id)}
                    className="border-indigo-200 bg-white text-indigo-700 hover:bg-indigo-600 hover:text-white"
                  >
                    <Wand2 className="h-3.5 w-3.5 mr-1.5" />
                    {preset.label}
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-6">
              {availability.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Clock className="h-12 w-12 mx-auto mb-3 text-gray-400" />
                  <p>No hay horarios de disponibilidad configurados.</p>
                  <p className="text-sm mt-1">
                    Usa una plantilla rápida o pulsa "Añadir horario" para crear uno.
                  </p>
                </div>
              ) : (
                groupedAvailability.map((group) => (
                  <section key={group.dayOfWeek} className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <h4 className="text-sm font-semibold text-gray-900">
                          {group.label}
                        </h4>
                        <span className="inline-flex items-center rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] font-medium text-indigo-700">
                          {group.slots.length === 1
                            ? '1 franja'
                            : `${group.slots.length} franjas`}
                        </span>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => addRangeToDay(group.dayOfWeek)}
                        className="shrink-0 text-indigo-600 hover:bg-indigo-50 hover:text-indigo-700"
                      >
                        <Plus className="h-3.5 w-3.5 mr-1" />
                        Añadir franja
                      </Button>
                    </div>

                    <div className="space-y-3">
                      {group.slots.map(({ slot, index }) => (
                        <Fragment key={index}>
                        <div className="flex min-w-0 flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3 shadow-sm sm:flex-row sm:items-end">
                          <div className="grid min-w-0 flex-1 grid-cols-1 gap-3 sm:grid-cols-2">
                            <div>
                              <Label className="text-xs">Hora de inicio</Label>
                              <Select
                                value={slot.startTime}
                                onValueChange={(value) =>
                                  updateAvailabilitySlot(index, 'startTime', value)
                                }
                              >
                              <SelectTrigger className="w-full min-w-0">
                                <SelectValue />
                              </SelectTrigger>
                                <SelectContent>
                                  {TIME_SLOTS.map((time) => (
                                    <SelectItem key={time} value={time}>
                                      {time}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>

                            <div>
                              <Label className="text-xs">Hora de finalización</Label>
                              <Select
                                value={slot.endTime}
                                onValueChange={(value) =>
                                  updateAvailabilitySlot(index, 'endTime', value)
                                }
                              >
                              <SelectTrigger className="w-full min-w-0">
                                <SelectValue />
                              </SelectTrigger>
                                <SelectContent>
                                  {TIME_SLOTS.map((time) => (
                                    <SelectItem key={time} value={time}>
                                      {time}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>

                          <div className="flex items-center gap-1 self-end sm:self-auto">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => openCopyPanel(index)}
                              aria-label="Copiar horario a otros días"
                              title="Copiar horario a otros días"
                              className="text-slate-500 hover:bg-indigo-50 hover:text-indigo-600"
                            >
                              <Copy className="h-4 w-4" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => removeAvailabilitySlot(index)}
                              aria-label="Eliminar franja"
                              className="text-red-600 hover:bg-red-50 hover:text-red-700"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>

                        {/* Copy panel: pick target days for this row's time range */}
                        {copyFrom === index && (
                          <div className="rounded-lg border border-indigo-200 bg-indigo-50/50 p-3">
                            <p className="text-xs font-semibold text-indigo-800 mb-2">
                              Copiar {slot.startTime}–{slot.endTime} a otros días
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {WEEK_ORDER.filter((dayValue) => dayValue !== slot.dayOfWeek).map((dayValue) => {
                                const day = DAYS_OF_WEEK.find(
                                  (d) => d.value === dayValue
                                )!;
                                const existingRanges = availability
                                  .filter((s) => s.dayOfWeek === dayValue)
                                  .map((s) => `${s.startTime}–${s.endTime}`)
                                  .sort();
                                const active = copyDays.includes(dayValue);
                                return (
                                  <button
                                    key={dayValue}
                                    type="button"
                                    onClick={() => toggleCopyDay(dayValue)}
                                    className={`inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                                      active
                                        ? 'border-indigo-600 bg-indigo-600 text-white'
                                        : 'border-slate-200 bg-white text-slate-700 hover:border-indigo-300'
                                    }`}
                                  >
                                    {day.label}
                                    {existingRanges.length > 0 && (
                                      <span
                                        className={
                                          active ? 'text-indigo-100' : 'text-slate-400'
                                        }
                                      >
                                        · {existingRanges.join(' + ')}
                                      </span>
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                            <p className="text-[11px] text-slate-500 mt-2">
                              Se sustituirá el horario actual de los días seleccionados.
                            </p>
                            <div className="mt-3 flex flex-wrap gap-2">
                              <Button
                                type="button"
                                size="sm"
                                disabled={copyDays.length === 0}
                                onClick={applyCopyToDays}
                                className="bg-indigo-600 hover:bg-indigo-700"
                              >
                                <Copy className="h-3.5 w-3.5 mr-1.5" />
                                Copiar a {copyDays.length}{' '}
                                {copyDays.length === 1 ? 'día' : 'días'}
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={closeCopyPanel}
                              >
                                Cancelar
                              </Button>
                            </div>
                          </div>
                        )}
                        </Fragment>
                      ))}
                    </div>
                  </section>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button 
            type="submit" 
            disabled={loading}
            className="bg-indigo-600 hover:bg-indigo-700"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                Guardando...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Guardar todos los cambios
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
