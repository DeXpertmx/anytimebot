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
import { CalendarOff, Loader2, Plus, Trash } from 'lucide-react';

interface TimeOff {
  id: string;
  name?: string | null;
  start: string;
  end: string;
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
  const [form, setForm] = useState({ name: '', start: '', end: '' });
  const { toast } = useToast();
  const { t } = useTranslation();

  useEffect(() => {
    fetchTimeOffs();
  }, []);

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
        body: JSON.stringify(form),
      });
      const data = await response.json();

      if (data.success) {
        toast({
          title: t('common.success'),
          description: t('timeOff.created'),
        });
        setOpen(false);
        setForm({ name: '', start: '', end: '' });
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
