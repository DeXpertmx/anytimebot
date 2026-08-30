'use client';

import { useTranslation } from '@/lib/i18n/hooks';
import { CreateBookingPageDialog } from './create-booking-page-dialog';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';

export function BookingPagesHeader() {
  const { t } = useTranslation();

  return (
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">{t('dashboard.bookingPages')}</h1>
        <p className="text-gray-600 mt-1">{t('bookingPages.subtitle')}</p>
      </div>
      <CreateBookingPageDialog>
        <Button className="bg-indigo-600 hover:bg-indigo-700">
          <Plus className="mr-2 h-4 w-4" />
          {t('bookingPages.create')}
        </Button>
      </CreateBookingPageDialog>
    </div>
  );
}
