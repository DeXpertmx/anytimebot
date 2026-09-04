'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from '@/lib/i18n/hooks';
import { CalendarOff, Loader2, Plus, Sofa, Trash } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface TimeOff {
  id: string;
  name?: string | null;
  start: string;
  end: string;
  resourceId?: string | null;
  resource?: { id: string; name: string } | null;
}

interface ResourceOption {
  id: string;
  name: string;
  isActive: boolean;
  location?: { id: string; name: string | null } | null;
}

function formatDay(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function TimeOffManager() {
  const [timeOffs, setTimeOffs] = useState<TimeOff[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', start: '', end: '', resourceId: '' });
  const [resources, setResources] = useState<ResourceOption[]>([]);
  const { toast } = useToast();
  const { t } = useTranslation();

  useEffect(() => {
    fetchTimeOffs();
    fetchResources();
  }, []);

  const fetchResources = async () => {
    try {
      const response = await fetch('/api/resources');
      const data = await response.json();
      if (data.success) {
        setResources(data.data || []);
      }
    } catch {
      // Non-critical: the selector simply stays hidden.
    }
  };

  const fetchTimeOffs = async () => {
    try {
      const response = await fetch('/api/time-off');
      const data = await response.json();
      if (data.success) {
        setTimeOffs(data.data);
      } else {
        toast({
          title: t('common.error'),
          description: t('timeOff.deleteFailed'),
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: t('common.error'),
        description: t('timeOff.deleteFailed'),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!form.start || !form.end) {
      toast({
        title: t('common.error'),
        description: t('timeOff.dateRequired'),
        variant: 'destructive',
      });
      return;
    }

    if (form.end < form.start) {
      toast({
        title: t('common.error'),
        description: t('timeOff.endBeforeStart'),
        variant: 'destructive',
      });
      return;
    }

    setSaving(true);
    try {
      const response = await fetch('/api/time-off', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          start: form.start,
          end: form.end,
          resourceId: form.resourceId || undefined,
        }),
      });
      const data = await response.json();

      if (data.success) {
        toast({
          title: t('common.success'),
          description: t('timeOff.created'),
        });
        setOpen(false);
        setForm({ name: '', start: '', end: '', resourceId: '' });
        fetchTimeOffs();
      } else {
        toast({
          title: t('common.error'),
          description: data.error || t('timeOff.createFailed'),
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: t('common.error'),
        description: t('timeOff.createFailed'),
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const response = await fetch(`/api/time-off/${id}`, { method: 'DELETE' });
      const data = await response.json();

      if (data.success) {
        toast({
          title: t('common.success'),
          description: t('timeOff.deleted'),
        });
        fetchTimeOffs();
      } else {
        toast({
          title: t('common.error'),
          description: t('timeOff.deleteFailed'),
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: t('common.error'),
        description: t('timeOff.deleteFailed'),
        variant: 'destructive',
      });
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <CalendarOff className="mr-2 h-5 w-5 text-indigo-600" />
            <CardTitle>{t('timeOff.title')}</CardTitle>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700">
                <Plus className="mr-1 h-4 w-4" />
                {t('timeOff.add')}
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[440px]">
              <DialogHeader>
                <DialogTitle>{t('timeOff.add')}</DialogTitle>
                <DialogDescription>{t('timeOff.subtitle')}</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="timeoff-name">{t('timeOff.name')}</Label>
                  <Input
                    id="timeoff-name"
                    placeholder={t('timeOff.namePlaceholder')}
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                </div>
                {resources.length > 0 && (
                  <div className="space-y-2">
                    <Label>{t('timeOff.resourceLabel')}</Label>
                    <Select
                      value={form.resourceId}
                      onValueChange={(value) => setForm({ ...form, resourceId: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={t('timeOff.scopeAll')} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">{t('timeOff.scopeAll')}</SelectItem>
                        {resources
                          .filter((r) => r.isActive)
                          .map((r) => (
                            <SelectItem key={r.id} value={r.id}>
                              {r.location?.name ? `${r.name} · ${r.location.name}` : r.name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-gray-500">{t('timeOff.scopeHint')}</p>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="timeoff-start">{t('timeOff.start')}</Label>
                    <Input
                      id="timeoff-start"
                      type="date"
                      value={form.start}
                      onChange={(e) => setForm({ ...form, start: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="timeoff-end">{t('timeOff.end')}</Label>
                    <Input
                      id="timeoff-end"
                      type="date"
                      min={form.start || undefined}
                      value={form.end}
                      onChange={(e) => setForm({ ...form, end: e.target.value })}
                      required
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                    {t('common.cancel')}
                  </Button>
                  <Button
                    type="submit"
                    disabled={saving}
                    className="bg-indigo-600 hover:bg-indigo-700"
                  >
                    {saving ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                        {t('timeOff.creating')}
                      </>
                    ) : (
                      t('common.save')
                    )}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
        <p className="text-sm text-gray-600 mt-1">{t('timeOff.subtitle')}</p>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-sm text-gray-500">{t('common.loading')}...</div>
        ) : timeOffs.length === 0 ? (
          <div className="text-center py-8">
            <CalendarOff className="mx-auto h-10 w-10 text-gray-300 mb-3" />
            <p className="text-gray-900 font-medium">{t('timeOff.empty')}</p>
            <p className="text-sm text-gray-500 mt-1">{t('timeOff.emptyDesc')}</p>
          </div>
        ) : (
          <ul className="space-y-3">
            {timeOffs.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between p-3 border rounded-lg bg-gray-50"
              >
                <div>
                  <p className="font-medium text-gray-900 text-sm">
                    {item.name || t('timeOff.title')}
                  </p>
                  <p className="text-sm text-gray-600">
                    {formatDay(item.start)} – {formatDay(item.end)}
                  </p>
                  {item.resource && (
                    <p className="mt-1 inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-600">
                      <Sofa className="h-3.5 w-3.5" />
                      {t('timeOff.onlyFor', { resource: item.resource.name })}
                    </p>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                  onClick={() => handleDelete(item.id)}
                >
                  <Trash className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
