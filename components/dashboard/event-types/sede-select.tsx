'use client';

import { useEffect, useState } from 'react';
import { Check, MapPin } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useTranslation } from '@/lib/i18n/hooks';

interface Sede {
  id: string;
  name: string;
  address?: string | null;
  city?: string | null;
  country?: string | null;
  timezone?: string | null;
  isActive: boolean;
}

interface SedeSelectProps {
  value: string; // default location id or ''
  onChange: (locationId: string) => void;
  idPrefix?: string;
}

/**
 * Optional default sede for in-person events (Phase B). Loads the user's sedes
 * from /api/locations and lets them pick one ('' = none). When one is chosen,
 * its address/timezone are shown underneath as a hint.
 *
 * Multi-sede: when the event is offered in several branches the guest picks
 * the branch on the public page. Selecting several here turns that picker on;
 * the FIRST selected sede is the default one (shown on the profile cards and
 * used when the picker is skipped).
 */
export function SedeSelect({ value, onChange, idPrefix = 'sede' }: SedeSelectProps) {
  const { t } = useTranslation();
  const [sedes, setSedes] = useState<Sede[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/locations')
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled && data.success) setSedes((data.data || []).filter((s: Sede) => s.isActive));
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const chosen = sedes.find((s) => s.id === value);

  return (
    <div className="space-y-2">
      <Label htmlFor={`${idPrefix}-select`}>{t('eventTypes.sedeLabel')}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={`${idPrefix}-select`}>
          <SelectValue placeholder={t('eventTypes.noSede')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="">{t('eventTypes.noSede')}</SelectItem>
          {sedes.map((s) => (
            <SelectItem key={s.id} value={s.id}>
              {s.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {chosen && (
        <p className="flex items-start gap-1.5 text-xs text-gray-500">
          <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400" />
          <span>
            {[chosen.address, chosen.city].filter(Boolean).join(', ')}
            {chosen.timezone ? ` · ${chosen.timezone}` : ''}
          </span>
        </p>
      )}
      <p className="text-xs text-gray-500">{t('eventTypes.sedeHint')}</p>
    </div>
  );
}

/**
 * Multi-selector of the branches where an in-person event is offered. A single
 * sede keeps today's behaviour; two or more activate the "elige sucursal" step
 * on the public booking page. `loadMore`/`loaded` keep the parent able to
 * render a loading state while sedes are fetched from /api/locations.
 */
export function SedeMultiSelect({
  value,
  onChange,
  idPrefix = 'sedes',
}: {
  value: string[];
  onChange: (ids: string[]) => void;
  idPrefix?: string;
}) {
  const { t } = useTranslation();
  const [sedes, setSedes] = useState<Sede[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/locations')
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled && data.success) setSedes((data.data || []).filter((s: Sede) => s.isActive));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = (id: string) => {
    if (value.includes(id)) {
      onChange(value.filter((v) => v !== id));
    } else {
      // Keep insertion order — the first entry is the default sede.
      onChange([...value, id]);
    }
  };

  return (
    <div className="space-y-2">
      <Label htmlFor={`${idPrefix}-list`}>{t('eventTypes.sedesLabel')}</Label>
      {sedes.length === 0 ? (
        <p className="text-xs text-gray-500">{t('eventTypes.sedesEmpty')}</p>
      ) : (
        <div id={`${idPrefix}-list`} className="space-y-1.5">
          {sedes.map((s) => {
            const active = value.includes(s.id);
            const isDefault = active && value[0] === s.id;
            return (
              <Button
                key={s.id}
                type="button"
                variant="outline"
                onClick={() => toggle(s.id)}
                className={`w-full justify-start gap-2 h-auto py-2.5 px-3 text-left ${active ? 'border-indigo-400 bg-indigo-50/60' : ''}`}
              >
                <span
                  className={`flex h-4.5 w-4.5 h-[18px] w-[18px] shrink-0 items-center justify-center rounded border ${active ? 'border-indigo-500 bg-indigo-500 text-white' : 'border-gray-300 bg-white'}`}
                >
                  {active && <Check className="h-3 w-3" />}
                </span>
                <span className="flex-1">
                  <span className="block text-sm font-medium text-gray-900">
                    {s.name}
                    {isDefault && (
                      <span className="ml-2 rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-indigo-700">
                        {t('eventTypes.defaultSede')}
                      </span>
                    )}
                  </span>
                  {(s.address || s.city || s.timezone) && (
                    <span className="mt-0.5 flex items-center gap-1 text-xs text-gray-500">
                      <MapPin className="h-3 w-3 shrink-0 text-gray-400" />
                      {[s.address, s.city].filter(Boolean).join(', ')}
                      {s.timezone ? ` · ${s.timezone}` : ''}
                    </span>
                  )}
                </span>
              </Button>
            );
          })}
        </div>
      )}
      <p className="text-xs text-gray-500">{t('eventTypes.sedesHint')}</p>
    </div>
  );
}
