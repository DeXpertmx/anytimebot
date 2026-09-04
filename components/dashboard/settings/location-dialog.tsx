'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
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
import { TimezoneSelect } from '@/components/ui/timezone-select';
import { useToast } from '@/hooks/use-toast';
import { Loader2, MapPin } from 'lucide-react';
import { COUNTRIES, type LocationItem } from './locations-resources-types';

interface LocationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  location: LocationItem | null; // null = create
  onSaved: () => void;
}

export function LocationDialog({ open, onOpenChange, location, onSaved }: LocationDialogProps) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [country, setCountry] = useState('');
  const [timezone, setTimezone] = useState('UTC');
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    if (open) {
      setName(location?.name ?? '');
      setAddress(location?.address ?? '');
      setCity(location?.city ?? '');
      setCountry(location?.country ?? '');
      setTimezone(location?.timezone ?? 'UTC');
      setIsActive(location?.isActive ?? true);
    }
  }, [open, location]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast({ title: 'Error', description: 'El nombre de la sede es obligatorio', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        address: address.trim() || null,
        city: city.trim() || null,
        country: country || null,
        timezone,
        isActive,
      };
      const res = await fetch(location ? `/api/locations/${location.id}` : '/api/locations', {
        method: location ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success) {
        toast({
          title: location ? 'Sede actualizada' : 'Sede creada',
          description: location ? 'Los cambios se guardaron correctamente' : 'La sede se creó correctamente',
        });
        onOpenChange(false);
        onSaved();
      } else {
        toast({ title: 'Error', description: data.error || 'No se pudo guardar la sede', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Ocurrió un error al guardar la sede', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-indigo-600" />
            {location ? 'Editar sede' : 'Nueva sede'}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="location-name">Nombre de la sede *</Label>
            <Input
              id="location-name"
              placeholder="Ej.: Sucursal Centro, Clínica Norte…"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="location-address">Dirección</Label>
            <Textarea
              id="location-address"
              placeholder="Calle, número, planta…"
              rows={2}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="location-city">Ciudad</Label>
              <Input
                id="location-city"
                placeholder="Madrid"
                value={city}
                onChange={(e) => setCity(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="location-country">País</Label>
              <Select value={country || '__none__'} onValueChange={(v) => setCountry(v === '__none__' ? '' : v)}>
                <SelectTrigger id="location-country">
                  <SelectValue placeholder="Selecciona un país" />
                </SelectTrigger>
                <SelectContent className="max-h-[260px]">
                  <SelectItem value="__none__">Sin país</SelectItem>
                  {COUNTRIES.map((c) => (
                    <SelectItem key={c.code} value={c.code}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="location-timezone">Zona horaria</Label>
            <TimezoneSelect value={timezone} onValueChange={setTimezone} className="w-full" />
            <p className="text-xs text-slate-500">
              Se usa para calcular la disponibilidad de esta sede. Si la sede está en otro huso, indícalo aquí.
            </p>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50/70 p-3">
            <div>
              <Label htmlFor="location-active" className="text-sm font-medium">Sede activa</Label>
              <p className="text-xs text-slate-500">Las sedes inactivas no pueden asignarse a nuevos recursos</p>
            </div>
            <Switch id="location-active" checked={isActive} onCheckedChange={setIsActive} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving} className="bg-indigo-600 hover:bg-indigo-700">
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {location ? 'Guardar cambios' : 'Crear sede'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
