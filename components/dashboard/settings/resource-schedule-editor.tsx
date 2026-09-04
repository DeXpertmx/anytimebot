'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, Trash2, Wand2, Info } from 'lucide-react';
import {
  DAYS_OF_WEEK,
  WEEK_ORDER,
  dayLabel,
  type ScheduleRule,
} from './locations-resources-types';

// Half-hour grid for the time pickers (48 options: 00:00 → 23:30).
const TIME_SLOTS = Array.from({ length: 48 }, (_, i) => {
  const hour = Math.floor(i / 2);
  const minute = i % 2 === 0 ? '00' : '30';
  return `${hour.toString().padStart(2, '0')}:${minute}`;
});

// Options for a time picker: the standard grid, plus the current value when it
// is not on the grid (legacy times like 09:15 must stay selectable, not blank).
const timeOptions = (value: string): string[] =>
  TIME_SLOTS.includes(value) ? TIME_SLOTS : [...TIME_SLOTS, value].sort();

const PRESETS: { id: string; label: string; rules: ScheduleRule[] }[] = [
  {
    id: 'weekdays-9-17',
    label: 'Lun–Vie · 9:00–17:00',
    rules: [1, 2, 3, 4, 5].map((dayOfWeek) => ({
      dayOfWeek,
      startTime: '09:00',
      endTime: '17:00',
    })),
  },
  {
    id: 'weekdays-9-14-15-17',
    label: 'Lun–Vie · partido 9–14 / 15–17',
    rules: [1, 2, 3, 4, 5].flatMap((dayOfWeek) => [
      { dayOfWeek, startTime: '09:00', endTime: '14:00' },
      { dayOfWeek, startTime: '15:00', endTime: '17:00' },
    ]),
  },
  {
    id: 'weekend-10-14',
    label: 'Fin de semana · 10:00–14:00',
    rules: [6, 0].map((dayOfWeek) => ({
      dayOfWeek,
      startTime: '10:00',
      endTime: '14:00',
    })),
  },
  {
    id: 'always',
    label: '24/7',
    rules: [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
      dayOfWeek,
      startTime: '00:00',
      endTime: '23:30',
    })),
  },
];

interface ResourceScheduleEditorProps {
  // Rules across ALL days; empty = inherit the booking page schedule.
  rules: ScheduleRule[];
  onChange: (rules: ScheduleRule[]) => void;
}

export function ResourceScheduleEditor({ rules, onChange }: ResourceScheduleEditorProps) {
  const ownSchedule = rules.length > 0;

  const addRangeToDay = (dayOfWeek: number) => {
    const dayRules = rules
      .filter((r) => r.dayOfWeek === dayOfWeek)
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
    const formatMinutes = (minutes: number) =>
      `${Math.floor(minutes / 60)
        .toString()
        .padStart(2, '0')}:${(minutes % 60).toString().padStart(2, '0')}`;

    if (dayRules.length === 0) {
      onChange([...rules, { dayOfWeek, startTime: '09:00', endTime: '17:00' }]);
      return;
    }
    const last = dayRules[dayRules.length - 1];
    const [h, m] = last.endTime.split(':').map(Number);
    const startMinutes = h * 60 + m;
    if (startMinutes >= 22 * 60) {
      onChange([...rules, { dayOfWeek, startTime: '22:00', endTime: '23:30' }]);
      return;
    }
    const endMinutes = Math.min(startMinutes + 90, 23 * 60 + 30);
    onChange([
      ...rules,
      {
        dayOfWeek,
        startTime: last.endTime,
        endTime: formatMinutes(endMinutes),
      },
    ]);
  };

  const updateRule = (index: number, patch: Partial<ScheduleRule>) => {
    const updated = [...rules];
    updated[index] = { ...updated[index], ...patch };
    // Keep a stable order: day asc, then start asc.
    updated.sort(
      (a, b) => a.dayOfWeek - b.dayOfWeek || a.startTime.localeCompare(b.startTime)
    );
    onChange(updated);
  };

  const removeRule = (index: number) => {
    onChange(rules.filter((_, i) => i !== index));
  };

  const applyPreset = (preset: (typeof PRESETS)[number]) => {
    onChange(preset.rules.map((r) => ({ ...r })));
  };

  const clearOwnSchedule = () => onChange([]);

  // Days that actually carry at least one open range.
  const activeDays = WEEK_ORDER.filter((day) =>
    rules.some((r) => r.dayOfWeek === day)
  );

  return (
    <div className="space-y-4">
      {/* Toggle: own schedule vs inherit */}
      <div className="flex items-start justify-between gap-4 rounded-lg border border-slate-200 bg-slate-50/70 p-3">
        <div className="space-y-1">
          <Label htmlFor="own-schedule" className="text-sm font-medium text-gray-900">
            Horario propio del recurso
          </Label>
          <p className="text-xs text-gray-500">
            Si está activado, este horario sustituye al de la página de reserva para
            este recurso. Si lo dejas desactivado, el recurso sigue el horario de la
            página donde se reserve.
          </p>
        </div>
        <Switch
          id="own-schedule"
          checked={ownSchedule}
          onCheckedChange={(checked) => {
            if (checked) {
              // Start from a sensible Mon–Fri 9–17 default.
              onChange([
                ...[1, 2, 3, 4, 5].map((dayOfWeek) => ({
                  dayOfWeek,
                  startTime: '09:00',
                  endTime: '17:00',
                })),
              ]);
            } else {
              clearOwnSchedule();
            }
          }}
        />
      </div>

      {!ownSchedule ? (
        <div className="flex items-start gap-2 rounded-lg border border-dashed border-slate-300 bg-white p-3 text-sm text-slate-500">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
          <p>
            El recurso hereda el horario de las páginas de reserva en las que se
            utilice. Activa «Horario propio» para fijar franjas concretas (por
            ejemplo, turnos partidos de 9:00–14:00 y 15:00–17:00).
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Presets */}
          <div>
            <p className="mb-2 text-xs font-semibold text-slate-500">
              Plantillas rápidas (reemplazan el horario actual)
            </p>
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((preset) => (
                <Button
                  key={preset.id}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => applyPreset(preset)}
                  className="border-slate-300 text-slate-700 hover:border-indigo-400 hover:text-indigo-700"
                >
                  <Wand2 className="h-3.5 w-3.5 mr-1.5" />
                  {preset.label}
                </Button>
              ))}
            </div>
          </div>

          {/* Per-day editor */}
          {activeDays.length === 0 ? (
            <div className="text-center rounded-lg border border-dashed border-slate-300 py-6 text-sm text-slate-500">
              No hay franjas configuradas. Usa una plantilla o añade horarios por día.
            </div>
          ) : (
            <div className="space-y-4">
              {activeDays.map((dayOfWeek) => {
                const dayRules = rules
                  .map((rule, index) => ({ rule, index }))
                  .filter(({ rule }) => rule.dayOfWeek === dayOfWeek)
                  .sort((a, b) => a.rule.startTime.localeCompare(b.rule.startTime));
                return (
                  <div key={dayOfWeek} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-gray-800">
                          {dayLabel(dayOfWeek)}
                        </span>
                        <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] font-medium text-indigo-700">
                          {dayRules.length === 1
                            ? '1 franja'
                            : `${dayRules.length} franjas`}
                        </span>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => addRangeToDay(dayOfWeek)}
                        className="text-indigo-600 hover:bg-indigo-50"
                      >
                        <Plus className="h-3.5 w-3.5 mr-1" />
                        Añadir franja
                      </Button>
                    </div>
                    <div className="space-y-2">
                      {dayRules.map(({ rule, index }) => (
                        <div
                          key={index}
                          className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-2 sm:flex-row sm:items-center"
                        >
                          <div className="grid flex-1 grid-cols-2 gap-2">
                            <div>
                              <Label className="text-[11px] text-slate-500">Desde</Label>
                              <Select
                                value={rule.startTime}
                                onValueChange={(value) =>
                                  updateRule(index, { startTime: value })
                                }
                              >
                                <SelectTrigger className="h-9 w-full">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="max-h-[220px]">
                                  {timeOptions(rule.startTime).map((time) => (
                                    <SelectItem key={time} value={time}>
                                      {time}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div>
                              <Label className="text-[11px] text-slate-500">Hasta</Label>
                              <Select
                                value={rule.endTime}
                                onValueChange={(value) =>
                                  updateRule(index, { endTime: value })
                                }
                              >
                                <SelectTrigger className="h-9 w-full">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="max-h-[220px]">
                                  {timeOptions(rule.endTime).map((time) => (
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
                            onClick={() => removeRule(index)}
                            aria-label="Eliminar franja"
                            className="h-9 w-9 shrink-0 self-end text-red-600 hover:bg-red-50 sm:self-auto"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}

              {/* Days without rules yet */}
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <span className="text-xs text-slate-500">Añadir día:</span>
                {WEEK_ORDER.filter((day) => !activeDays.includes(day)).map((day) => (
                  <button
                    key={day}
                    type="button"
                    onClick={() => addRangeToDay(day)}
                    className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 transition-colors hover:border-indigo-400 hover:text-indigo-700"
                  >
                    <Plus className="mr-1 h-3 w-3" />
                    {dayLabel(day)}
                  </button>
                ))}
                {WEEK_ORDER.every((day) => activeDays.includes(day)) && null}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Weekday quick view of the whole week */}
      <WeekStrip rules={rules} />

      {ownSchedule && (
        <div className="flex justify-end">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={clearOwnSchedule}
            className="text-slate-500 hover:text-red-600"
          >
            Volver a heredar el horario de la página
          </Button>
        </div>
      )}
    </div>
  );
}

/** Compact Monday-first summary of which weekdays are open. */
function WeekStrip({ rules }: { rules: ScheduleRule[] }) {
  const active = (dayOfWeek: number) => rules.some((r) => r.dayOfWeek === dayOfWeek);
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {WEEK_ORDER.map((day) => (
        <span
          key={day}
          className={`inline-flex min-w-[2.5rem] items-center justify-center rounded-md px-1.5 py-1 text-[11px] font-medium ${
            active(day)
              ? 'bg-indigo-600 text-white'
              : 'bg-slate-100 text-slate-400 line-through'
          }`}
        >
          {DAYS_OF_WEEK.find((d) => d.value === day)?.short}
        </span>
      ))}
    </div>
  );
}
