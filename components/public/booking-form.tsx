
'use client';

import { useRef, useState, useEffect } from 'react';
import { format, addDays, isSameDay } from 'date-fns';
import { es as esLocale, enUS } from 'date-fns/locale';
import { Calendar, Clock, ChevronLeft, ChevronRight, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from '@/lib/i18n/hooks';
import { computeAnnualSavings } from '@/lib/membership-pricing';
import { TimezoneSelect } from '@/components/ui/timezone-select';
import { PhoneCountryInput, getDialCode } from '@/components/ui/phone-country-input';

interface EventType {
  id: string;
  name: string;
  duration: number;
  location: string;
  color: string;
  price: number;
  currency: string;
  collectPayment: boolean;
  paymentInterval?: string;
  formFields: Array<{
    id: string;
    label: string;
    type: string;
    required: boolean;
    options: string[];
    placeholder?: string | null;
  }>;
}

interface Availability {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
}

interface BookingFormProps {
  bookingPage: {
    id: string;
    slug: string;
    brandColor?: string | null;
  };
  eventTypes: EventType[];
  availability: Availability[];
  timezone: string;
  preselectedEventId?: string;
}

export function BookingForm({
  bookingPage,
  eventTypes,
  availability,
  timezone,
  preselectedEventId,
}: BookingFormProps) {
  const { toast } = useToast();
  const { t, i18n: i18nInstance } = useTranslation();
  const brandColor = bookingPage.brandColor || '#6366f1';
  const [selectedEventType, setSelectedEventType] = useState<EventType | null>(
    (preselectedEventId && eventTypes.find((e) => e.id === preselectedEventId)) ||
      eventTypes[0] ||
      null
  );
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedTime, setSelectedTime] = useState<string>('');
  const [availableSlots, setAvailableSlots] = useState<string[]>([]);
  const [viewMonth, setViewMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [isLoading, setIsLoading] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const formRef = useRef<HTMLFormElement>(null);

  const changeStep = (next: 1 | 2 | 3) => {
    setStep(next);
    requestAnimationFrame(() => {
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const [userTimezone, setUserTimezone] = useState<string>(() => {
    // Get user's timezone on client side
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      return timezone || 'UTC';
    }
  });
  const [formData, setFormData] = useState<Record<string, any>>({
    guestName: '',
    guestEmail: '',
    guestPhone: '',
    guestCountry: 'ES',
  });

  const STEPS: { n: 1 | 2 | 3; labelKey: string }[] = [
    { n: 1, labelKey: 'stepDate' },
    { n: 2, labelKey: 'stepTime' },
    { n: 3, labelKey: 'stepDetails' },
  ];

  const intervalLabel = (interval?: string) =>
    interval === 'MONTH'
      ? t('eventTypes.intervalMonth')
      : interval === 'YEAR'
        ? t('eventTypes.intervalYear')
        : t('pricing.oneTime');

  // For yearly memberships, compute the annual total and the savings vs. the
  // monthly alternative. Prefers a real monthly event with the same name on
  // the same booking page; falls back to the prorated equivalent (price / 12).
  const yearlySavings = selectedEventType
    ? computeAnnualSavings(eventTypes, selectedEventType)
    : null;

  // date-fns locale follows the UI language (Spanish by default, English second)
  const dateLocale = i18nInstance.language?.startsWith('en') ? enUS : esLocale;

  // Check if a date is available
  const isDateAvailable = (date: Date) => {
    const dayOfWeek = date.getDay();
    return availability.some((av) => av.dayOfWeek === dayOfWeek);
  };

  // Calendar month helpers — Monday-first grid, Calendly-style
  const today = new Date();
  const monthLabel = format(viewMonth, 'MMMM yyyy', { locale: dateLocale });
  const canGoBack =
    viewMonth.getFullYear() > today.getFullYear() ||
    (viewMonth.getFullYear() === today.getFullYear() &&
      viewMonth.getMonth() > today.getMonth());

  const monthCells: (Date | null)[] = (() => {
    const year = viewMonth.getFullYear();
    const month = viewMonth.getMonth();
    const firstOfMonth = new Date(year, month, 1);
    const leadingEmpty = (firstOfMonth.getDay() + 6) % 7; // Monday = 0
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells: (Date | null)[] = Array.from({ length: leadingEmpty }, () => null);
    for (let day = 1; day <= daysInMonth; day++) {
      cells.push(new Date(year, month, day));
    }
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  })();

  // Weekday header (Mon-Sun) in the active language
  const weekdayLabels = Array.from({ length: 7 }, (_, i) =>
    format(addDays(new Date(2024, 0, 1), i), 'EEE', { locale: dateLocale })
  );

  // Fetch available time slots for selected date
  useEffect(() => {
    const fetchAvailableSlots = async () => {
      if (!selectedDate || !selectedEventType) {
        setAvailableSlots([]);
        return;
      }

      try {
        const response = await fetch('/api/bookings/check-availability', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            eventTypeId: selectedEventType.id,
            date: format(selectedDate, 'yyyy-MM-dd'),
          }),
        });

        if (response.ok) {
          const result = await response.json();
          // Handle both success response formats
          const slots = result.availableSlots || result.data?.availableSlots || [];
          setAvailableSlots(slots);
        } else {
          console.error('Error response:', await response.text());
          setAvailableSlots([]);
        }
      } catch (error) {
        console.error('Error fetching available slots:', error);
        setAvailableSlots([]);
      }
    };

    fetchAvailableSlots();
  }, [selectedDate, selectedEventType]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedEventType || !selectedDate || !selectedTime) {
      toast({
        title: 'Missing Information',
        description: 'Please select an event type, date, and time.',
        variant: 'destructive',
      });
      return;
    }

    // Validate required custom form fields
    const missingRequired = (selectedEventType.formFields || []).filter(
      (f) => f.required && (formData[f.id] === undefined || formData[f.id] === '' || formData[f.id] === false)
    );
    if (missingRequired.length > 0) {
      toast({
        title: 'Missing Information',
        description: `Please fill in: ${missingRequired.map((f) => f.label).join(', ')}`,
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);

    try {
      const startTime = new Date(
        `${format(selectedDate, 'yyyy-MM-dd')}T${selectedTime}`
      );

      // Check if payment is required
      if (selectedEventType.collectPayment && selectedEventType.price > 0) {
        // Redirect to Stripe Checkout
        const paymentResponse = await fetch('/api/bookings/create-payment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            eventTypeId: selectedEventType.id,
            guestName: formData.guestName,
            guestEmail: formData.guestEmail,
            startTime: startTime.toISOString(),
            timezone: userTimezone,
          }),
        });

        if (paymentResponse.ok) {
          const paymentData = await paymentResponse.json();
          if (paymentData.data?.url) {
            // Redirect to Stripe Checkout
            window.location.href = paymentData.data.url;
            return;
          }
        } else {
          const error = await paymentResponse.json();
          toast({
            title: 'Payment Error',
            description: error.error || 'Failed to create payment session',
            variant: 'destructive',
          });
          setIsLoading(false);
          return;
        }
      }

      // Regular booking (no payment required)
      const endTime = new Date(
        startTime.getTime() + selectedEventType.duration * 60000
      );

      const response = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventTypeId: selectedEventType.id,
          guestName: formData.guestName,
          guestEmail: formData.guestEmail,
          guestPhone: formData.guestPhone || null,
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString(),
          timezone: userTimezone,
          formData: formData,
        }),
      });

      if (response.ok) {
        const booking = await response.json();
        toast({
          title: 'Booking Confirmed! 🎉',
          description: `Your meeting has been scheduled for ${format(
            startTime,
            'PPP p'
          )}. A confirmation email has been sent.`,
        });

        // Reset form
        setSelectedDate(null);
        setSelectedTime('');
        setStep(1);
        setFormData({
          guestName: '',
          guestEmail: '',
          guestPhone: '',
          guestCountry: 'ES',
        });
      } else {
        const error = await response.json();
        toast({
          title: 'Booking Failed',
          description: error.error || 'Failed to create booking',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Error creating booking:', error);
      toast({
        title: 'Error',
        description: 'An error occurred while creating the booking',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-6">
      {/* Stepper: Fecha → Hora → Detalles */}
      <nav
        aria-label={t('bookingForm.stepsAria')}
        className="flex items-center justify-center gap-3 sm:gap-4"
      >
        {STEPS.map((s, index) => {
          const done = step > s.n;
          const active = step === s.n;
          return (
            <div key={s.n} className="flex items-center gap-3 sm:gap-4">
              {index > 0 && (
                <div
                  className={`h-0.5 w-6 rounded-full transition-colors sm:w-12 ${
                    step > index ? 'bg-indigo-500' : 'bg-slate-200'
                  }`}
                />
              )}
              <button
                type="button"
                disabled={!done}
                onClick={() => changeStep(s.n)}
                className={`flex items-center gap-2 rounded-full py-1 pl-1 pr-3 ${
                  done ? 'cursor-pointer' : 'cursor-default'
                }`}
              >
                <span
                  className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                    active
                      ? 'text-white shadow-sm'
                      : done
                        ? 'bg-indigo-100 text-indigo-700'
                        : 'bg-slate-100 text-slate-400'
                  }`}
                  style={active ? { backgroundColor: brandColor } : undefined}
                >
                  {done ? <Check className="h-3.5 w-3.5" /> : s.n}
                </span>
                <span
                  className={`text-xs font-medium sm:text-sm ${
                    active ? 'text-gray-900' : done ? 'text-gray-600' : 'text-slate-400'
                  }`}
                >
                  {t(`bookingForm.${s.labelKey}`)}
                </span>
              </button>
            </div>
          );
        })}
      </nav>

      {/* ---------- Step 1: Fecha ---------- */}
      {step === 1 && (
        <>
      {/* Event Type Selection */}
      {eventTypes.length > 1 && (
        <div>
          <Label htmlFor="eventType">Event Type</Label>
          <Select
            value={selectedEventType?.id || ''}
            onValueChange={(value) => {
              const eventType = eventTypes.find((et) => et.id === value);
              setSelectedEventType(eventType || null);
              setSelectedDate(null);
              setSelectedTime('');
            }}
          >
            <SelectTrigger id="eventType">
              <SelectValue placeholder="Select an event type" />
            </SelectTrigger>
            <SelectContent>
              {eventTypes.map((eventType) => {
                const savings = computeAnnualSavings(eventTypes, eventType)?.percent;
                return (
                  <SelectItem key={eventType.id} value={eventType.id}>
                    {eventType.name} ({eventType.duration} min)
                    {eventType.collectPayment && eventType.price > 0
                      ? ` · ${(eventType.price / 100).toFixed(2)} ${eventType.currency.toUpperCase()} ${intervalLabel(eventType.paymentInterval)}`
                      : ''}
                    {savings ? ` · ${t('bookingForm.savePercent', { percent: savings })}` : ''}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Date Selection — Calendly-style month picker */}
      <div>
        <Label className="mb-3 block">{t('bookingForm.selectDate')}</Label>

        <div className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4">
          <div className="flex items-center justify-between">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              disabled={!canGoBack}
              onClick={() =>
                setViewMonth(
                  new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1)
                )
              }
              aria-label={t('bookingForm.prevMonth')}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-semibold capitalize text-slate-800">
              {monthLabel}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() =>
                setViewMonth(
                  new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1)
                )
              }
              aria-label={t('bookingForm.nextMonth')}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          <div className="mt-3 grid grid-cols-7 text-center">
            {weekdayLabels.map((label, i) => (
              <span
                key={i}
                className="text-[11px] font-semibold uppercase tracking-wide text-slate-400"
              >
                {label}
              </span>
            ))}
          </div>

          <div className="mt-1 grid grid-cols-7 gap-1">
            {monthCells.map((date, index) => {
              if (!date) return <div key={`empty-${index}`} />;
              const available = isDateAvailable(date);
              const isPast = date < today && !isSameDay(date, today);
              const isSelected = selectedDate && isSameDay(date, selectedDate);
              const isToday = isSameDay(date, today);
              const isDisabled = !available || isPast;
              return (
                <button
                  key={date.toISOString()}
                  type="button"
                  aria-label={format(date, 'EEEE d MMMM', { locale: dateLocale })}
                  onClick={() => {
                    if (!isDisabled) {
                      setSelectedDate(date);
                      setSelectedTime('');
                      changeStep(2);
                    }
                  }}
                  disabled={isDisabled}
                  style={
                    isSelected
                      ? { backgroundColor: brandColor, borderColor: brandColor }
                      : undefined
                  }
                  className={`relative aspect-square rounded-lg border text-sm font-semibold transition-colors ${
                    isSelected
                      ? 'text-white shadow-sm'
                      : isDisabled
                        ? 'cursor-not-allowed border-transparent text-slate-300'
                        : 'border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  {format(date, 'd')}
                  {isToday && !isSelected && (
                    <span
                      className="absolute inset-x-1.5 bottom-1 h-0.5 rounded-full"
                      style={{ backgroundColor: brandColor }}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      </>
      )}

      {/* ---------- Step 2: Hora ---------- */}
      {step === 2 && selectedDate && (
        <>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => changeStep(1)}
              className="-ml-2 text-slate-500 hover:text-slate-800"
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              {t('bookingForm.stepBack')}
            </Button>
          </div>

        <div>
          <div className="mb-3">
            <Label className="block">{t('bookingForm.selectTime')}</Label>
            <p
              className="mt-0.5 text-sm font-medium capitalize"
              style={{ color: brandColor }}
            >
              {format(selectedDate, 'EEEE, d MMMM', { locale: dateLocale })}
            </p>
          </div>
          {availableSlots.length === 0 ? (
            <p className="text-sm text-gray-600 text-center py-4">
              {t('bookingForm.noSlots')}
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
              {availableSlots.map((slot) => (
                <button
                  key={slot}
                  type="button"
                  onClick={() => {
                    setSelectedTime(slot);
                    changeStep(3);
                  }}
                  style={
                    selectedTime === slot
                      ? { backgroundColor: brandColor, borderColor: brandColor }
                      : undefined
                  }
                  className={`min-h-[44px] rounded-lg border px-2 py-2.5 text-sm font-semibold transition-colors ${
                    selectedTime === slot
                      ? 'text-white shadow-sm'
                      : 'border-slate-200 text-slate-700 hover:bg-indigo-50'
                  }`}
                >
                  {slot}
                </button>
              ))}
            </div>
          )}
        </div>
      </>
      )}

      {/* ---------- Step 3: Detalles ---------- */}
      {step === 3 && selectedDate && selectedTime && (
        <>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => changeStep(2)}
              className="-ml-2 text-slate-500 hover:text-slate-800"
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              {t('bookingForm.stepBack')}
            </Button>
          </div>

          {/* Selection summary — keeps the chosen date/time visible */}
          <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-indigo-500">
              {t('bookingForm.summaryTitle')}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-800">
              <span className="font-semibold">
                {selectedEventType?.name} ({selectedEventType?.duration} min)
                {selectedEventType?.collectPayment && selectedEventType.price > 0
                  ? ` · ${(selectedEventType.price / 100).toFixed(2)} ${selectedEventType.currency.toUpperCase()}`
                  : ''}
              </span>
              <span className="capitalize text-gray-600">
                {format(selectedDate, 'EEEE, d MMMM', { locale: dateLocale })}
              </span>
              <span className="font-semibold" style={{ color: brandColor }}>
                {selectedTime}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap gap-3 text-xs">
              <button
                type="button"
                onClick={() => changeStep(1)}
                className="font-medium text-indigo-600 underline underline-offset-2 hover:text-indigo-800"
              >
                {t('bookingForm.changeDate')}
              </button>
              <button
                type="button"
                onClick={() => changeStep(2)}
                className="font-medium text-indigo-600 underline underline-offset-2 hover:text-indigo-800"
              >
                {t('bookingForm.changeTime')}
              </button>
            </div>
          </div>

        <div className="space-y-4">
          <h4 className="font-semibold text-gray-900">Your Information</h4>
          
          <div>
            <Label htmlFor="guestName">
              Name <span className="text-red-500">*</span>
            </Label>
            <Input
              id="guestName"
              value={formData.guestName}
              onChange={(e) =>
                setFormData({ ...formData, guestName: e.target.value })
              }
              required
              placeholder="Enter your full name"
            />
          </div>

          <div>
            <Label htmlFor="guestEmail">
              Email <span className="text-red-500">*</span>
            </Label>
            <Input
              id="guestEmail"
              type="email"
              value={formData.guestEmail}
              onChange={(e) =>
                setFormData({ ...formData, guestEmail: e.target.value })
              }
              required
              placeholder="your.email@example.com"
            />
          </div>

          <div>
            <Label htmlFor="guestPhone">Teléfono (opcional)</Label>
            <PhoneCountryInput
              id="guestPhone"
              value={formData.guestPhone}
              country={formData.guestCountry}
              onCountryChange={(guestCountry) => setFormData({ ...formData, guestCountry })}
              onChange={(phone) => setFormData({ ...formData, guestPhone: `${getDialCode(formData.guestCountry)} ${phone.replace(/^\+\d+\s*/, '')}` })}
              placeholder="612 345 678"
            />
          </div>

          <div>
            <Label htmlFor="timezone">
              Time Zone <span className="text-red-500">*</span>
            </Label>
            <TimezoneSelect
              value={userTimezone}
              onValueChange={setUserTimezone}
            />
            <p className="text-sm text-gray-500 mt-1">
              All times will be shown in your selected timezone
            </p>
          </div>

          {/* Custom Form Fields */}
          {selectedEventType?.formFields.map((field) => (
            <div key={field.id}>
              <Label htmlFor={field.id}>
                {field.label}
                {field.required && <span className="text-red-500"> *</span>}
              </Label>
              {field.type === 'TEXT' && (
                <Input
                  id={field.id}
                  value={formData[field.id] || ''}
                  onChange={(e) =>
                    setFormData({ ...formData, [field.id]: e.target.value })
                  }
                  required={field.required}
                  placeholder={field.placeholder || ''}
                />
              )}
              {field.type === 'TEXTAREA' && (
                <Textarea
                  id={field.id}
                  value={formData[field.id] || ''}
                  onChange={(e) =>
                    setFormData({ ...formData, [field.id]: e.target.value })
                  }
                  required={field.required}
                  placeholder={field.placeholder || ''}
                />
              )}
              {field.type === 'SELECT' && (
                <Select
                  value={formData[field.id] || ''}
                  onValueChange={(value) =>
                    setFormData({ ...formData, [field.id]: value })
                  }
                >
                  <SelectTrigger id={field.id}>
                    <SelectValue placeholder="Select an option" />
                  </SelectTrigger>
                  <SelectContent>
                    {field.options.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {field.type === 'EMAIL' && (
                <Input
                  id={field.id}
                  type="email"
                  value={formData[field.id] || ''}
                  onChange={(e) =>
                    setFormData({ ...formData, [field.id]: e.target.value })
                  }
                  required={field.required}
                  placeholder={field.placeholder || 'name@example.com'}
                />
              )}
              {field.type === 'PHONE' && (
                <Input
                  id={field.id}
                  type="tel"
                  value={formData[field.id] || ''}
                  onChange={(e) =>
                    setFormData({ ...formData, [field.id]: e.target.value })
                  }
                  required={field.required}
                  placeholder={field.placeholder || '+1 (555) 123-4567'}
                />
              )}
              {field.type === 'CHECKBOX' && (
                <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700">
                  <input
                    id={field.id}
                    type="checkbox"
                    checked={formData[field.id] === true}
                    onChange={(e) =>
                      setFormData({ ...formData, [field.id]: e.target.checked })
                    }
                    className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  {field.placeholder || field.label}
                </label>
              )}
            </div>
          ))}

          {/* Price Display */}
          {selectedEventType?.collectPayment && selectedEventType.price > 0 && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <span className="text-emerald-700 font-medium">
                  {selectedEventType.paymentInterval === 'MONTH'
                    ? t('bookingForm.paymentMonthly')
                    : selectedEventType.paymentInterval === 'YEAR'
                      ? t('bookingForm.paymentYearly')
                      : t('bookingForm.paymentRequired')}
                </span>
                <span className="text-emerald-800 font-bold text-lg">
                  {(selectedEventType.price / 100).toFixed(2)} {selectedEventType.currency.toUpperCase()}
                  {selectedEventType.paymentInterval === 'MONTH'
                    ? ` / ${t('bookingForm.perMonth')}`
                    : selectedEventType.paymentInterval === 'YEAR'
                      ? ` / ${t('bookingForm.perYear')}`
                      : ''}
                </span>
              </div>
              {selectedEventType.paymentInterval === 'YEAR' && yearlySavings && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center rounded-full bg-emerald-600 px-2.5 py-0.5 text-xs font-semibold text-white">
                    {t('bookingForm.savePercent', { percent: yearlySavings.percent })}
                  </span>
                  <span className="text-sm font-medium text-emerald-700">
                    {t('bookingForm.billedAnnually')}
                  </span>
                </div>
              )}
              <p className="text-sm text-emerald-600 mt-1">
                {selectedEventType.paymentInterval === 'MONTH' || selectedEventType.paymentInterval === 'YEAR'
                  ? t('bookingForm.subscriptionNote', {
                      interval: selectedEventType.paymentInterval === 'YEAR'
                        ? t('bookingForm.perYear')
                        : t('bookingForm.perMonth'),
                    })
                  : t('bookingForm.securePaymentNote')}
              </p>
              {selectedEventType.paymentInterval === 'MONTH' || selectedEventType.paymentInterval === 'YEAR' ? (
                <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700">
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="11" width="18" height="11" rx="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                  {t('bookingForm.cancelAnytime')}
                </p>
              ) : null}
            </div>
          )}

          <Button
            type="submit"
            disabled={isLoading}
            className="w-full"
            style={{ backgroundColor: brandColor }}
          >
            {isLoading
              ? 'Procesando...'
              : selectedEventType?.collectPayment && selectedEventType.price > 0
                ? `${t('bookingForm.continueToPayment')} · ${(selectedEventType.price / 100).toFixed(2)} ${selectedEventType.currency.toUpperCase()}`
                : t('bookingForm.confirmBooking')}
          </Button>
        </div>
        </>
      )}
    </form>
  );
}
