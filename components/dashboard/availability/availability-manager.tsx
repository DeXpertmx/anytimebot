
'use client';

import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Clock, Info } from 'lucide-react';
import { useTranslation } from '@/lib/i18n/hooks';

const dayKeys = [
  { id: 0, key: 'daySun', short: 'Sun' },
  { id: 1, key: 'dayMon', short: 'Mon' },
  { id: 2, key: 'dayTue', short: 'Tue' },
  { id: 3, key: 'dayWed', short: 'Wed' },
  { id: 4, key: 'dayThu', short: 'Thu' },
  { id: 5, key: 'dayFri', short: 'Fri' },
  { id: 6, key: 'daySat', short: 'Sat' },
];

export function AvailabilityManager() {
  const { t } = useTranslation();
  return (
    <div className="space-y-6">
      {/* Info Card */}
      <Card className="p-4 bg-blue-50 border-blue-200">
        <div className="flex items-start">
          <Info className="h-5 w-5 text-blue-600 mr-3 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm text-blue-900 font-medium">
              {t('availability.globalSettings')}
            </p>
            <p className="text-sm text-blue-700 mt-1">
              {t('availability.globalSettingsDesc')}
            </p>
          </div>
        </div>
      </Card>

      {/* Quick Access Card */}
      <Card className="p-6">
        <div className="flex items-center mb-6">
          <Clock className="h-5 w-5 text-indigo-600 mr-2" />
          <h2 className="text-xl font-semibold text-gray-900">
            {t('availability.manageTitle')}
          </h2>
        </div>

        <div className="space-y-4">
          <p className="text-gray-600">
            {t('availability.manageIntro')}
          </p>
          <ol className="list-decimal list-inside space-y-2 text-gray-700">
            <li>{t('availability.step1')}</li>
            <li>{t('availability.step2')}</li>
            <li>{t('availability.step3')}</li>
            <li>{t('availability.step4')}</li>
          </ol>

          <div className="pt-4">
            <Button
              onClick={() => (window.location.href = '/dashboard/booking-pages')}
              className="bg-indigo-600 hover:bg-indigo-700"
            >
              {t('availability.goToBookingPages')}
            </Button>
          </div>
        </div>
      </Card>

      {/* Default Working Hours Example */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          {t('availability.exampleTitle')}
        </h3>
        <p className="text-sm text-gray-600 mb-4">
          {t('availability.exampleDesc')}
        </p>

        <div className="space-y-3">
          {dayKeys.map((day) => {
            const isWeekday = day.id >= 1 && day.id <= 5;
            return (
              <div
                key={day.id}
                className={`flex items-center justify-between p-4 border rounded-lg ${
                  isWeekday
                    ? 'bg-white border-gray-200'
                    : 'bg-gray-50 border-gray-100'
                }`}
              >
                <div className="flex items-center">
                  <span className="font-medium text-gray-900 w-24">
                    {t(`availability.${day.key}`)}
                  </span>
                  {isWeekday ? (
                    <div className="flex items-center text-sm text-gray-600">
                      <Clock className="h-4 w-4 mr-2 text-indigo-600" />
                      <span>{t('availability.workHours')}</span>
                    </div>
                  ) : (
                    <span className="text-sm text-gray-500">{t('availability.unavailable')}</span>
                  )}
                </div>
                <div className="text-sm">
                  {isWeekday ? (
                    <span className="text-green-600 font-medium">{t('availability.available')}</span>
                  ) : (
                    <span className="text-gray-400">{t('availability.notAvailable')}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
