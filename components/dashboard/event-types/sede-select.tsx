'use client';

import { useEffect, useState } from 'react';
import { MapPin } from 'lucide-react';
import { Label } from '@/components/ui/label';
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
  value: string; // location id or ''
  onChange: (locationId: string) => void;
  idPrefix?: string;
}

/**
 * Optional default sede for in-person events (Phase B). Loads the user's sedes
 * from /api/locations and lets them pick one ('' = none). When one is chosen,
 * its address/timezone are shown underneath as a hint.
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
