'use client';

import { useEffect, useState } from 'react';
import { Loader2, MapPin, Sofa } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from '@/lib/i18n/hooks';
import Link from 'next/link';

interface ResourceOption {
  id: string;
  name: string;
  type: string;
  isActive: boolean;
  location?: { id: string; name: string } | null;
}

const RESOURCE_TYPE_LABELS: Record<string, string> = {
  ROOM: 'Sala',
  CHAIR: 'Sillón',
  EQUIPMENT: 'Equipo',
  STATION: 'Puesto',
  OTHER: 'Otro',
};

interface ResourceMultiSelectProps {
  /** Currently selected resource ids */
  value: string[];
  onChange: (resourceIds: string[]) => void;
}

export function ResourceMultiSelect({ value, onChange }: ResourceMultiSelectProps) {
  const [resources, setResources] = useState<ResourceOption[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const { t } = useTranslation();

  useEffect(() => {
    let cancelled = false;
    fetch('/api/resources')
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled && data.success) setResources(data.data || []);
      })
      .catch(() => {
        toast({ title: t('common.error'), description: 'No se pudieron cargar los recursos', variant: 'destructive' });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [toast, t]);

  const toggle = (id: string) => {
    if (value.includes(id)) {
      onChange(value.filter((v) => v !== id));
    } else {
      onChange([...value, id]);
    }
  };

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-gray-900">{t('eventTypes.resourcesTitle')}</p>
      <p className="text-xs text-gray-500">{t('eventTypes.resourcesDescription')}</p>

      {loading ? (
        <div className="flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-5 text-sm text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" /> {t('common.loading')}
        </div>
      ) : resources.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50/60 p-4 text-sm text-slate-500">
          <p>{t('eventTypes.resourcesEmpty')}</p>
          <Link
            href="/dashboard/settings"
            className="mt-1 inline-block text-xs font-medium text-indigo-600 hover:underline"
          >
            {t('dashboard.settings')} →
          </Link>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {resources.map((resource) => {
              const selected = value.includes(resource.id);
              const typeLabel = RESOURCE_TYPE_LABELS[resource.type] || resource.type;
              return (
                <button
                  key={resource.id}
                  type="button"
                  onClick={() => toggle(resource.id)}
                  aria-pressed={selected}
                  title={resource.location?.name}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                    selected
                      ? 'border-indigo-600 bg-indigo-600 text-white shadow-sm'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-indigo-300 hover:bg-indigo-50'
                  }`}
                >
                  <Sofa className="h-3.5 w-3.5" />
                  {resource.name}
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                      selected ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {typeLabel}
                  </span>
                  {resource.location && (
                    <span
                      className={`flex items-center gap-0.5 text-[11px] ${
                        selected ? 'text-indigo-100' : 'text-slate-400'
                      }`}
                    >
                      <MapPin className="h-3 w-3" />
                      {resource.location.name}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <p className="text-xs text-slate-500">
            {value.length === 0
              ? t('eventTypes.resourcesNone')
              : value.length === 1
                ? t('eventTypes.resourcesSelectedOne', { count: 1 })
                : t('eventTypes.resourcesSelected', { count: value.length })}
          </p>
        </>
      )}
    </div>
  );
}
