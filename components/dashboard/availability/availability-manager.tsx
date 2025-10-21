
'use client';

import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Clock, Info } from 'lucide-react';

const daysOfWeek = [
  { id: 0, name: 'Sunday', short: 'Sun' },
  { id: 1, name: 'Monday', short: 'Mon' },
  { id: 2, name: 'Tuesday', short: 'Tue' },
  { id: 3, name: 'Wednesday', short: 'Wed' },
  { id: 4, name: 'Thursday', short: 'Thu' },
  { id: 5, name: 'Friday', short: 'Fri' },
  { id: 6, name: 'Saturday', short: 'Sat' },
];

export function AvailabilityManager() {
  return (
    <div className="space-y-6">
      {/* Info Card */}
      <Card className="p-4 bg-blue-50 border-blue-200">
        <div className="flex items-start">
          <Info className="h-5 w-5 text-blue-600 mr-3 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm text-blue-900 font-medium">
              Global Availability Settings
            </p>
            <p className="text-sm text-blue-700 mt-1">
              Availability is configured per booking page. Go to{' '}
              <strong>My Booking Pages</strong> and select a booking page to
              configure its availability settings. Each booking page can have
              different working hours and time slots.
            </p>
          </div>
        </div>
      </Card>

      {/* Quick Access Card */}
      <Card className="p-6">
        <div className="flex items-center mb-6">
          <Clock className="h-5 w-5 text-indigo-600 mr-2" />
          <h2 className="text-xl font-semibold text-gray-900">
            Manage Availability
          </h2>
        </div>

        <div className="space-y-4">
          <p className="text-gray-600">
            To set your working hours and availability:
          </p>
          <ol className="list-decimal list-inside space-y-2 text-gray-700">
            <li>Navigate to <strong>My Booking Pages</strong> in the sidebar</li>
            <li>Select the booking page you want to configure</li>
            <li>Set your available days and time slots</li>
            <li>Save your changes</li>
          </ol>

          <div className="pt-4">
            <Button
              onClick={() => (window.location.href = '/dashboard/booking-pages')}
              className="bg-indigo-600 hover:bg-indigo-700"
            >
              Go to Booking Pages
            </Button>
          </div>
        </div>
      </Card>

      {/* Default Working Hours Example */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Default Working Hours Example
        </h3>
        <p className="text-sm text-gray-600 mb-4">
          This is an example of typical working hours. Configure actual
          availability in your booking pages.
        </p>

        <div className="space-y-3">
          {daysOfWeek.map((day) => {
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
                    {day.name}
                  </span>
                  {isWeekday ? (
                    <div className="flex items-center text-sm text-gray-600">
                      <Clock className="h-4 w-4 mr-2 text-indigo-600" />
                      <span>9:00 AM - 5:00 PM</span>
                    </div>
                  ) : (
                    <span className="text-sm text-gray-500">Unavailable</span>
                  )}
                </div>
                <div className="text-sm">
                  {isWeekday ? (
                    <span className="text-green-600 font-medium">Available</span>
                  ) : (
                    <span className="text-gray-400">Not Available</span>
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
