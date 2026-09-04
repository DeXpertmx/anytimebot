'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Sofa } from 'lucide-react';
import { ResourceScheduleEditor } from './resource-schedule-editor';
import {
  RESOURCE_TYPES,
  type LocationItem,
  type ResourceItem,
  type ScheduleRule,
} from './locations-resources-types';

interface ResourceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  resource: ResourceItem | null; // null = create
  locations: LocationItem[];
  onSaved: () => void;
}

export function ResourceDialog({ open, onOpenChange, resource, locations, onSaved }: ResourceDialogProps) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState('ROOM');
  const [locationId, setLocationId] = useState('');
  const [capacity, setCapacity] = useState('1');
  const [isActive, setIsActive] = useState(true);
  const [rules, setRules] = useState<ScheduleRule[]>([]);

  useEffect(() => {
    if (open) {
      setName(resource?.name ?? '');
      setType(resource?.type ?? 'ROOM');
      setLocationId(resource?.location?.id ?? '');
      setCapacity(String(resource?.capacity ?? 1));
      setIsActive(resource?.isActive ?? true);
      setRules(
        (resource?.availabilities ?? []).map((a) => ({
          id: a.id,
          dayOfWeek: a.dayOfWeek,
          startTime: a.startTime,
          endTime: a.endTime,
        }))
      );
    }
  }, [open, resource]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast({ title: 'Error', description: 'El nombre del recurso es obligatorio', variant: 'destructive' });
      return;
    }
    const capacityNum = parseInt(capacity, 10);
    if (Number.isNaN(capacityNum) || capacityNum < 1 || capacityNum > 999) {
      toast({ title: 'Error', description: 'La capacidad debe ser un número entre 1 y 999', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        type,
        locationId: locationId || null,
        capacity: capacityNum,
        isActive,
        // Own schedule rules (empty = inherit page schedule).
        availability: rules.map((r) => ({
          dayOfWeek: r.dayOfWeek,
          startTime: r.startTime,
          endTime: r.endTime,
        })),
      };
      const res = await fetch(resource ? `/api/resources/${resource.id}` : '/api/resources', {
        method: resource ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success) {
        toast({
          title: resource ? 'Recurso actualizado' : 'Recurso creado',
          description: resource ? 'Los cambios se guardaron correctamente' : 'El recurso se creó correctamente',
        });
        onOpenChange(false);
        onSaved();
      } else {
        toast({ title: 'Error', description: data.error || 'No se pudo guardar el recurso', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Ocurrió un error al guardar el recurso', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const selectedType = RESOURCE_TYPES.find((t) => t.value === type);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sofa className="h-5 w-5 text-indigo-600" />
            {resource ? 'Editar recurso' : 'Nuevo recurso'}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="resource-name">Nombre del recurso *</Label>
              <Input
                id="resource-name"
                placeholder="Ej.: Sillón 2, Sala de rayos X, Consultorio A…"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="resource-type">Tipo</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger id="resource-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RESOURCE_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.emoji} {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="resource-location">Sede</Label>
              <Select value={locationId || '__none__'} onValueChange={(v) => setLocationId(v === '__none__' ? '' : v)}>
                <SelectTrigger id="resource-location">
                  <SelectValue placeholder="Sin sede asignada" />
                </SelectTrigger>
                <SelectContent className="max-h-[240px]">
                  <SelectItem value="__none__">Sin sede (recurso móvil)</SelectItem>
                  {locations.map((loc) => (
                    <SelectItem key={loc.id} value={loc.id}>
                      {loc.name}{loc.isActive ? '' : ' (inactiva)'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-slate-500">
                {locationId
                  ? 'Este recurso se mostrará asociado a su sede.'
                  : 'Un recurso sin sede es móvil y no se vincula a una ubicación física.'}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="resource-capacity">Capacidad</Label>
              <Input
                id="resource-capacity"
                type="number"
                min={1}
                max={999}
                value={capacity}
                onChange={(e) => setCapacity(e.target.value)}
              />
              <p className="text-xs text-slate-500">
                Reservas simultáneas permitidas. 1 = uso exclusivo (sillón, consultorio).
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50/70 p-3">
            <div>
              <Label htmlFor="resource-active" className="text-sm font-medium">Recurso activo</Label>
              <p className="text-xs text-slate-500">Los recursos inactivos no se ofrecen al reservar</p>
            </div>
            <Switch id="resource-active" checked={isActive} onCheckedChange={setIsActive} />
          </div>

          {/* Optional own schedule */}
          <div className="rounded-xl border border-slate-200 p-4">
            <div className="mb-3 flex items-center gap-2">
              <span className="text-sm font-semibold text-gray-900">Horario</span>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                opcional
              </span>
            </div>
            <ResourceScheduleEditor rules={rules} onChange={setRules} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving} className="bg-indigo-600 hover:bg-indigo-700">
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {resource ? 'Guardar cambios' : 'Crear recurso'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
