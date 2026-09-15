'use client';

import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from '@/lib/i18n/hooks';
import { CalendarOff, Clock, Plus, Sofa, Trash } from 'lucide-react';
import { formatBlockWindow, isWholeDayBlock } from '@/lib/time-off';
import { TimeOffDialog } from './time-off-dialog';

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

/**
 * Away blocks for the schedule: whole days off (vacations) and partial-hour
 * blocks (lunch break, errands). Creation lives in the shared TimeOffDialog so
 * the calendar's quick action and this list behave identically.
 */
export function TimeOffManager() {
  const [timeOffs, setTimeOffs] = useState<TimeOff[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const { t } = useTranslation();

  const fetchTimeOffs = useCallback(async () => {
    try {
      const response = await fetch('/api/time-off');
      const data = await response.json();
      if (data.success) {
        setTimeOffs(data.data || []);
      } else {
        toast({
          title: t('common.error'),
          description: t('timeOff.deleteFailed'),
          variant: 'destructive',
        });
      }
    } catch {
      toast({
        title: t('common.error'),
        description: t('timeOff.deleteFailed'),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [toast, t]);

  useEffect(() => {
    fetchTimeOffs();
  }, [fetchTimeOffs]);

  const handleDelete = async (id: string) => {
    try {
      const response = await fetch(`/api/time-off/${id}`, { method: 'DELETE' });
      const data = await response.json();

      if (data.success) {
        toast({ title: t('common.success'), description: t('timeOff.deleted') });
        fetchTimeOffs();
      } else {
        toast({
          title: t('common.error'),
          description: t('timeOff.deleteFailed'),
          variant: 'destructive',
        });
      }
    } catch {
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
          <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700" onClick={() => setOpen(true)}>
            <Plus className="mr-1 h-4 w-4" />
            {t('timeOff.add')}
          </Button>
        </div>
        <p className="mt-1 text-sm text-gray-600">{t('timeOff.subtitle')}</p>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-sm text-gray-500">{t('common.loading')}...</div>
        ) : timeOffs.length === 0 ? (
          <div className="py-8 text-center">
            <CalendarOff className="mx-auto mb-3 h-10 w-10 text-gray-300" />
            <p className="font-medium text-gray-900">{t('timeOff.empty')}</p>
            <p className="mt-1 text-sm text-gray-500">{t('timeOff.emptyDesc')}</p>
          </div>
        ) : (
          <ul className="space-y-3">
            {timeOffs.map((item) => (
              <li key={item.id} className="flex items-center justify-between rounded-lg border bg-gray-50 p-3">
                <div>
                  <p className="text-sm font-medium text-gray-900">{item.name || t('timeOff.title')}</p>
                  <p className="flex items-center gap-1.5 text-sm text-gray-600">
                    {!isWholeDayBlock(item) && <Clock className="h-3.5 w-3.5 text-rose-500" />}
                    {formatBlockWindow(item)}
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
                  className="text-red-600 hover:bg-red-50 hover:text-red-700"
                  onClick={() => handleDelete(item.id)}
                >
                  <Trash className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <TimeOffDialog open={open} onOpenChange={setOpen} onCreated={fetchTimeOffs} />
    </Card>
  );
}
