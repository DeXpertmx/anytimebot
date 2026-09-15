'use client';

import { useEffect, useState } from 'react';
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
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from '@/lib/i18n/hooks';
import { Loader2 } from 'lucide-react';

interface ResourceOption {
  id: string;
  name: string;
  isActive: boolean;
  location?: { id: string; name: string | null } | null;
}

type BlockMode = 'day' | 'hours';

export interface TimeOffDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Prefill for the start date (`YYYY-MM-DD`). */
  defaultDate?: string;
  /** Prefill for the end date (`YYYY-MM-DD`). Defaults to `defaultDate`. */
  defaultEndDate?: string;
  /** Prefill the hours mode with these local times (`HH:MM`). */
  defaultStartTime?: string;
  defaultEndTime?: string;
  /** Called after a block is created so callers can refresh their lists. */
  onCreated?: () => void;
}

function todayYmd(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/**
 * Create an absence: a whole-day block (vacation) or just a few hours
 * (lunch break, an errand). Shared by the calendar's quick action and the
 * Settings section, so both stay in sync.
 */
export function TimeOffDialog({
  open,
  onOpenChange,
  defaultDate,
  defaultEndDate,
  defaultStartTime = '14:00',
  defaultEndTime = '16:00',
  onCreated,
}: TimeOffDialogProps) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const [mode, setMode] = useState<BlockMode>('day');
  const [saving, setSaving] = useState(false);
  const [resources, setResources] = useState<ResourceOption[]>([]);
  const [form, setForm] = useState({
    name: '',
    start: defaultDate || todayYmd(),
    end: defaultEndDate || defaultDate || todayYmd(),
    startTime: defaultStartTime,
    endTime: defaultEndTime,
    resourceId: '',
  });

  // Reset the form to the prefilled values every time the dialog opens.
  useEffect(() => {
    if (!open) return;
    setMode('day');
    setForm({
      name: '',
      start: defaultDate || todayYmd(),
      end: defaultEndDate || defaultDate || todayYmd(),
      startTime: defaultStartTime,
      endTime: defaultEndTime,
      resourceId: '',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, defaultDate, defaultEndDate]);

  useEffect(() => {
    if (!open) return;
    fetch('/api/resources')
      .then((res) => res.json())
      .then((data) => {
        if (data.success) setResources(data.data || []);
      })
      .catch(() => {
        // Non-critical: the resource selector simply stays empty.
      });
  }, [open]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!form.start || !form.end) {
      toast({ title: t('common.error'), description: t('timeOff.dateRequired'), variant: 'destructive' });
      return;
    }

    let payload: Record<string, unknown>;

    if (mode === 'day') {
      if (form.end < form.start) {
        toast({ title: t('common.error'), description: t('timeOff.endBeforeStart'), variant: 'destructive' });
        return;
      }
      // Send the *local* day bounds as instants: storing bare dates would make
      // the server read them as UTC and shift the blocked day for non-UTC
      // timezones (a Madrid 20th would become the 19th/21st).
      const dayStart = new Date(`${form.start}T00:00:00`);
      const dayEnd = new Date(`${form.end}T23:59:59.999`);
      payload = {
        name: form.name,
        allDay: true,
        start: dayStart.toISOString(),
        end: dayEnd.toISOString(),
        resourceId: form.resourceId || undefined,
      };
    } else {
      if (!form.startTime || !form.endTime) {
        toast({ title: t('common.error'), description: t('timeOff.hoursRequired'), variant: 'destructive' });
        return;
      }
      // Build instants from the local date + time so the blocked hours are the
      // ones the business actually meant (the API stores ISO/UTC).
      const startInstant = new Date(`${form.start}T${form.startTime}:00`);
      const endInstant = new Date(`${form.end || form.start}T${form.endTime}:00`);
      if (Number.isNaN(startInstant.getTime()) || Number.isNaN(endInstant.getTime()) || endInstant <= startInstant) {
        toast({ title: t('common.error'), description: t('timeOff.endTimeBeforeStart'), variant: 'destructive' });
        return;
      }
      payload = {
        name: form.name,
        allDay: false,
        start: startInstant.toISOString(),
        end: endInstant.toISOString(),
        resourceId: form.resourceId || undefined,
      };
    }

    setSaving(true);
    try {
      const response = await fetch('/api/time-off', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json();

      if (data.success) {
        toast({ title: t('common.success'), description: t('timeOff.created') });
        onOpenChange(false);
        onCreated?.();
      } else {
        toast({
          title: t('common.error'),
          description: data.error || t('timeOff.createFailed'),
          variant: 'destructive',
        });
      }
    } catch {
      toast({ title: t('common.error'), description: t('timeOff.createFailed'), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle>{t('timeOff.add')}</DialogTitle>
          <DialogDescription>{t('timeOff.subtitle')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Whole day vs. a few hours */}
          <div className="flex rounded-lg border p-1">
            {(['day', 'hours'] as BlockMode[]).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setMode(value)}
                className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition ${
                  mode === value ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {value === 'day' ? t('timeOff.allDay') : t('timeOff.hours')}
              </button>
            ))}
          </div>

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
              {/* Radix forbids an empty-string value, hence the 'all' sentinel. */}
              <Select
                value={form.resourceId || 'all'}
                onValueChange={(value) => setForm({ ...form, resourceId: value === 'all' ? '' : value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('timeOff.scopeAll')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('timeOff.scopeAll')}</SelectItem>
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
                onChange={(e) => setForm({ ...form, start: e.target.value, end: mode === 'day' && form.end === form.start ? e.target.value : form.end })}
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

          {mode === 'hours' && (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="timeoff-start-time">{t('timeOff.startTime')}</Label>
                  <Input
                    id="timeoff-start-time"
                    type="time"
                    value={form.startTime}
                    onChange={(e) => setForm({ ...form, startTime: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="timeoff-end-time">{t('timeOff.endTime')}</Label>
                  <Input
                    id="timeoff-end-time"
                    type="time"
                    value={form.endTime}
                    onChange={(e) => setForm({ ...form, endTime: e.target.value })}
                    required
                  />
                </div>
              </div>
              <p className="text-xs text-gray-500">{t('timeOff.hoursHint')}</p>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={saving} className="bg-indigo-600 hover:bg-indigo-700">
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
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
  );
}
