'use client';

import { useTranslation } from '@/lib/i18n/hooks';

export function AvailabilityHeader() {
  const { t } = useTranslation();

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900">{t('dashboard.availability')}</h1>
      <p className="text-gray-600 mt-1">{t('availability.subtitle')}</p>
    </div>
  );
}
