'use client';

import { useTranslation } from '@/lib/i18n/hooks';

export function CustomersHeader() {
  const { t } = useTranslation();

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900">{t('dashboard.customers')}</h1>
      <p className="text-gray-600 mt-1">{t('crm.subtitle')}</p>
    </div>
  );
}
