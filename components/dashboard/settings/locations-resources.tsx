'use client';

import { useCallback, useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import {
  Building2,
  Loader2,
  MapPin,
  Pencil,
  Plus,
  RefreshCw,
  Sofa,
  Trash2,
  Users,
} from 'lucide-react';
import { LocationDialog } from './location-dialog';
import { ResourceDialog } from './resource-dialog';
import {
  countryName,
  dayShort,
  resourceTypeEmoji,
  resourceTypeLabel,
  type LocationItem,
  type ResourceItem,
} from './locations-resources-types';

function formatScheduleSummary(rules: { dayOfWeek: number; startTime: string; endTime: string }[]): string {
  if (rules.length === 0) return 'Hereda el horario de la página';
  const byDay = new Map<number, string[]>();
  for (const r of rules) {
    const ranges = byDay.get(r.dayOfWeek) ?? [];
    ranges.push(`${r.startTime}–${r.endTime}`);
    byDay.set(r.dayOfWeek, ranges);
  }
  const order = [1, 2, 3, 4, 5, 6, 0];
  const parts: string[] = [];
  for (const day of order) {
    const ranges = byDay.get(day);
    if (!ranges) continue;
    parts.push(`${dayShort(day)} ${ranges.join(', ')}`);
  }
  return parts.join(' · ');
}

export function LocationsResources() {
  const { toast } = useToast();
  const [locations, setLocations] = useState<LocationItem[]>([]);
  const [resources, setResources] = useState<ResourceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState('locations');

  // Dialog state
  const [locationDialogOpen, setLocationDialogOpen] = useState(false);
  const [editingLocation, setEditingLocation] = useState<LocationItem | null>(null);
  const [resourceDialogOpen, setResourceDialogOpen] = useState(false);
  const [editingResource, setEditingResource] = useState<ResourceItem | null>(null);

  // Delete confirmations
  const [deletingLocation, setDeletingLocation] = useState<LocationItem | null>(null);
  const [deletingResource, setDeletingResource] = useState<ResourceItem | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [locRes, resRes] = await Promise.all([
        fetch('/api/locations'),
        fetch('/api/resources'),
      ]);
      const locData = await locRes.json();
      const resData = await resRes.json();
      if (locData.success) setLocations(locData.data);
      if (resData.success) setResources(resData.data);
    } catch (error) {
      console.error('Error loading locations/resources:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar las ubicaciones y recursos',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const handleRefresh = () => {
    setRefreshing(true);
    load();
  };

  const handleToggleLocation = async (location: LocationItem) => {
    try {
      const res = await fetch(`/api/locations/${location.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !location.isActive }),
      });
      const data = await res.json();
      if (data.success) {
        toast({ title: 'Sede actualizada', description: `«${location.name}» ${data.data.isActive ? 'activada' : 'desactivada'}` });
        handleRefresh();
      } else {
        toast({ title: 'Error', description: data.error || 'No se pudo actualizar la sede', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Ocurrió un error al actualizar la sede', variant: 'destructive' });
    }
  };

  const handleToggleResource = async (resource: ResourceItem) => {
    try {
      const res = await fetch(`/api/resources/${resource.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !resource.isActive }),
      });
      const data = await res.json();
      if (data.success) {
        toast({ title: 'Recurso actualizado', description: `«${resource.name}» ${data.data.isActive ? 'activado' : 'desactivado'}` });
        handleRefresh();
      } else {
        toast({ title: 'Error', description: data.error || 'No se pudo actualizar el recurso', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Ocurrió un error al actualizar el recurso', variant: 'destructive' });
    }
  };

  const confirmDeleteLocation = async () => {
    if (!deletingLocation) return;
    setDeleteBusy(true);
    try {
      const res = await fetch(`/api/locations/${deletingLocation.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        toast({ title: 'Sede eliminada', description: `«${deletingLocation.name}» se eliminó correctamente` });
        setDeletingLocation(null);
        handleRefresh();
      } else {
        toast({ title: 'Error', description: data.error || 'No se pudo eliminar la sede', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Ocurrió un error al eliminar la sede', variant: 'destructive' });
    } finally {
      setDeleteBusy(false);
    }
  };

  const confirmDeleteResource = async () => {
    if (!deletingResource) return;
    setDeleteBusy(true);
    try {
      const res = await fetch(`/api/resources/${deletingResource.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        toast({ title: 'Recurso eliminado', description: `«${deletingResource.name}» se eliminó correctamente` });
        setDeletingResource(null);
        handleRefresh();
      } else {
        toast({ title: 'Error', description: data.error || 'No se pudo eliminar el recurso', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Ocurrió un error al eliminar el recurso', variant: 'destructive' });
    } finally {
      setDeleteBusy(false);
    }
  };

  return (
    <Card className="p-6">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center">
            <Building2 className="h-5 w-5 text-indigo-600 mr-2" />
            <h2 className="text-xl font-semibold text-gray-900">Ubicaciones y recursos</h2>
          </div>
          <p className="text-sm text-gray-600 mt-1">
            Gestiona tus sedes (sucursales, clínicas, estudios…) y los recursos reservables
            (salas, sillones, equipos) con sus horarios propios.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
            {refreshing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            Recargar
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-slate-400">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      ) : (
        <Tabs value={tab} onValueChange={setTab}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <TabsList>
              <TabsTrigger value="locations">
                <MapPin className="h-4 w-4 mr-1.5" />
                Sedes ({locations.length})
              </TabsTrigger>
              <TabsTrigger value="resources">
                <Sofa className="h-4 w-4 mr-1.5" />
                Recursos ({resources.length})
              </TabsTrigger>
            </TabsList>
            <Button
              size="sm"
              className="bg-indigo-600 hover:bg-indigo-700"
              onClick={() => {
                if (tab === 'locations') {
                  setEditingLocation(null);
                  setLocationDialogOpen(true);
                } else {
                  setEditingResource(null);
                  setResourceDialogOpen(true);
                }
              }}
            >
              <Plus className="h-4 w-4 mr-1.5" />
              {tab === 'locations' ? 'Nueva sede' : 'Nuevo recurso'}
            </Button>
          </div>

          {/* Sedes */}
          <TabsContent value="locations" className="mt-4 space-y-3">
            {locations.length === 0 ? (
              <EmptyState
                icon={<MapPin className="h-10 w-10 text-slate-300" />}
                title="Aún no tienes sedes"
                text="Crea una sede para agrupar recursos por ubicación (ej. «Sucursal Centro», «Clínica Norte»)."
              />
            ) : (
              locations.map((loc) => (
                <div
                  key={loc.id}
                  className={`rounded-xl border p-4 transition-colors ${
                    loc.isActive ? 'border-slate-200 bg-white' : 'border-slate-200 bg-slate-50'
                  }`}
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`text-base font-semibold ${loc.isActive ? 'text-gray-900' : 'text-slate-500'}`}>
                          {loc.name}
                        </span>
                        {!loc.isActive && <Badge variant="secondary">Inactiva</Badge>}
                        <Badge variant="outline" className="text-slate-500">
                          <Users className="h-3 w-3 mr-1" />
                          {loc._count?.resources ?? 0}{' '}
                          {(loc._count?.resources ?? 0) === 1 ? 'recurso' : 'recursos'}
                        </Badge>
                      </div>
                      <p className="mt-1 text-sm text-slate-500">
                        {[loc.address, loc.city, countryName(loc.country)]
                          .filter(Boolean)
                          .join(' · ') || 'Sin dirección'}
                        {loc.timezone && loc.timezone !== 'UTC' ? ` · ${loc.timezone}` : ''}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <Switch
                        checked={loc.isActive}
                        onCheckedChange={() => handleToggleLocation(loc)}
                        aria-label={`Activar sede ${loc.name}`}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setEditingLocation(loc);
                          setLocationDialogOpen(true);
                        }}
                        aria-label={`Editar sede ${loc.name}`}
                        title="Editar"
                      >
                        <Pencil className="h-4 w-4 text-slate-500 hover:text-indigo-600" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setDeletingLocation(loc)}
                        aria-label={`Eliminar sede ${loc.name}`}
                        title="Eliminar"
                        className="hover:bg-red-50"
                      >
                        <Trash2 className="h-4 w-4 text-slate-500 hover:text-red-600" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </TabsContent>

          {/* Recursos */}
          <TabsContent value="resources" className="mt-4 space-y-3">
            {resources.length === 0 ? (
              <EmptyState
                icon={<Sofa className="h-10 w-10 text-slate-300" />}
                title="Aún no tienes recursos"
                text="Crea salas, sillones o equipos para que se asignen automáticamente al reservar un tipo de evento."
              />
            ) : (
              resources.map((resource) => (
                <div
                  key={resource.id}
                  className={`rounded-xl border p-4 transition-colors ${
                    resource.isActive ? 'border-slate-200 bg-white' : 'border-slate-200 bg-slate-50'
                  }`}
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-base">{resourceTypeEmoji(resource.type)}</span>
                        <span className={`text-base font-semibold ${resource.isActive ? 'text-gray-900' : 'text-slate-500'}`}>
                          {resource.name}
                        </span>
                        {!resource.isActive && <Badge variant="secondary">Inactivo</Badge>}
                        <Badge variant="outline" className="text-indigo-700">
                          {resourceTypeLabel(resource.type)}
                        </Badge>
                        {resource.capacity > 1 && (
                          <Badge variant="outline" className="text-slate-500">
                            <Users className="h-3 w-3 mr-1" />
                            capacidad {resource.capacity}
                          </Badge>
                        )}
                      </div>
                      <p className="mt-1 text-sm text-slate-500">
                        {resource.location ? (
                          <>
                            <MapPin className="mr-1 inline h-3.5 w-3.5" />
                            {resource.location.name}
                          </>
                        ) : (
                          'Sin sede (móvil)'
                        )}
                        {resource._count?.bookings ? ` · ${resource._count.bookings} reserva(s)` : ''}
                      </p>
                      <p className="mt-1 text-xs text-slate-400">
                        {formatScheduleSummary(resource.availabilities)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <Switch
                        checked={resource.isActive}
                        onCheckedChange={() => handleToggleResource(resource)}
                        aria-label={`Activar recurso ${resource.name}`}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setEditingResource(resource);
                          setResourceDialogOpen(true);
                        }}
                        aria-label={`Editar recurso ${resource.name}`}
                        title="Editar"
                      >
                        <Pencil className="h-4 w-4 text-slate-500 hover:text-indigo-600" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setDeletingResource(resource)}
                        aria-label={`Eliminar recurso ${resource.name}`}
                        title="Eliminar"
                        className="hover:bg-red-50"
                      >
                        <Trash2 className="h-4 w-4 text-slate-500 hover:text-red-600" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </TabsContent>
        </Tabs>
      )}

      {/* Dialogs */}
      <LocationDialog
        open={locationDialogOpen}
        onOpenChange={setLocationDialogOpen}
        location={editingLocation}
        onSaved={handleRefresh}
      />
      <ResourceDialog
        open={resourceDialogOpen}
        onOpenChange={setResourceDialogOpen}
        resource={editingResource}
        locations={locations}
        onSaved={handleRefresh}
      />

      {/* Delete confirmations */}
      <ConfirmDialog
        open={!!deletingLocation}
        onOpenChange={(open) => !open && setDeletingLocation(null)}
        title="Eliminar sede"
        description={
          deletingLocation
            ? `¿Seguro que quieres eliminar «${deletingLocation.name}»? Sus recursos no se borran: quedarán sin sede asignada, y las reservas pasadas conservan su información.`
            : ''
        }
        busy={deleteBusy}
        onConfirm={confirmDeleteLocation}
      />
      <ConfirmDialog
        open={!!deletingResource}
        onOpenChange={(open) => !open && setDeletingResource(null)}
        title="Eliminar recurso"
        description={
          deletingResource
            ? `¿Seguro que quieres eliminar «${deletingResource.name}»? Se quitará de los tipos de evento donde se use. Las reservas pasadas conservan su información.`
            : ''
        }
        busy={deleteBusy}
        onConfirm={confirmDeleteResource}
      />
    </Card>
  );
}

function EmptyState({
  icon,
  title,
  text,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
}) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 py-12 text-center">
      <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-slate-50">
        {icon}
      </div>
      <p className="text-sm font-semibold text-gray-700">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">{text}</p>
    </div>
  );
}

function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  busy,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  busy: boolean;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-red-600">{title}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-slate-600">{description}</p>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancelar
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Eliminar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
