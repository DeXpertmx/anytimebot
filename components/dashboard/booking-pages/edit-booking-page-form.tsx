
'use client';

import { useState } from 'react';
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
import { Save, Loader2, Globe, Calendar, Clock, Plus, Trash2, Wand2 } from 'lucide-react';
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

  const addAvailabilitySlot = () => {
    setAvailability([
      ...availability,
      { dayOfWeek: 1, startTime: '09:00', endTime: '17:00', isAvailable: true },
    ]);
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

            <div className="space-y-4">
              {availability.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Clock className="h-12 w-12 mx-auto mb-3 text-gray-400" />
                  <p>No hay horarios de disponibilidad configurados.</p>
                  <p className="text-sm mt-1">
                    Usa una plantilla rápida o pulsa "Añadir horario" para crear uno.
                  </p>
                </div>
              ) : (
                availability.map((slot, index) => (
                  <div
                    key={index}
                    className="flex min-w-0 flex-col gap-4 rounded-xl border border-slate-200 bg-slate-50/70 p-4 shadow-sm sm:flex-row sm:items-end"
                  >
                    <div className="grid min-w-0 flex-1 grid-cols-1 gap-4 sm:grid-cols-3">
                      <div>
                        <Label className="text-xs">Día de la semana</Label>
                        <Select
                          value={slot.dayOfWeek.toString()}
                          onValueChange={(value) =>
                            updateAvailabilitySlot(index, 'dayOfWeek', parseInt(value))
                          }
                        >
                        <SelectTrigger className="w-full min-w-0">
                          <SelectValue />
                        </SelectTrigger>
                          <SelectContent>
                            {DAYS_OF_WEEK.map((day) => (
                              <SelectItem key={day.value} value={day.value.toString()}>
                                {day.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

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

                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeAvailabilitySlot(index)}
                      className="self-end text-red-600 hover:bg-red-50 hover:text-red-700 sm:self-auto"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
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
