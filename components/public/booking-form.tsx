
'use client';

import { useState, useEffect } from 'react';
import { format, addDays, startOfWeek, isSameDay, parseISO } from 'date-fns';
import { Calendar, Clock, ChevronLeft, ChevronRight } from 'lucide-react';
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
import { TimezoneSelect } from '@/components/ui/timezone-select';

interface EventType {
  id: string;
  name: string;
  duration: number;
  location: string;
  color: string;
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
  };
  eventTypes: EventType[];
  availability: Availability[];
  timezone: string;
}

export function BookingForm({
  bookingPage,
  eventTypes,
  availability,
  timezone,
}: BookingFormProps) {
  const { toast } = useToast();
  const [selectedEventType, setSelectedEventType] = useState<EventType | null>(
    eventTypes[0] || null
  );
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedTime, setSelectedTime] = useState<string>('');
  const [availableSlots, setAvailableSlots] = useState<string[]>([]);
  const [currentWeekStart, setCurrentWeekStart] = useState(
    startOfWeek(new Date(), { weekStartsOn: 0 })
  );
  const [isLoading, setIsLoading] = useState(false);
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
  });

  // Generate week dates
  const weekDates = Array.from({ length: 7 }, (_, i) =>
    addDays(currentWeekStart, i)
  );

  // Check if a date is available
  const isDateAvailable = (date: Date) => {
    const dayOfWeek = date.getDay();
    return availability.some((av) => av.dayOfWeek === dayOfWeek);
  };

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

    setIsLoading(true);

    try {
      const startTime = new Date(
        `${format(selectedDate, 'yyyy-MM-dd')}T${selectedTime}`
      );
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
        setFormData({
          guestName: '',
          guestEmail: '',
          guestPhone: '',
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
    <form onSubmit={handleSubmit} className="space-y-6">
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
              {eventTypes.map((eventType) => (
                <SelectItem key={eventType.id} value={eventType.id}>
                  {eventType.name} ({eventType.duration} min)
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Date Selection */}
      <div>
        <Label className="mb-3 block">Select a Date</Label>
        <div className="flex items-center justify-between mb-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              setCurrentWeekStart(addDays(currentWeekStart, -7))
            }
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="font-medium">
            {format(currentWeekStart, 'MMM yyyy')}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              setCurrentWeekStart(addDays(currentWeekStart, 7))
            }
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="grid grid-cols-7 gap-2">
          {weekDates.map((date) => {
            const available = isDateAvailable(date);
            const isPast = date < new Date() && !isSameDay(date, new Date());
            const isSelected = selectedDate && isSameDay(date, selectedDate);

            return (
              <button
                key={date.toISOString()}
                type="button"
                onClick={() => {
                  if (available && !isPast) {
                    setSelectedDate(date);
                    setSelectedTime('');
                  }
                }}
                disabled={!available || isPast}
                className={`p-3 rounded-lg border text-center transition-colors ${
                  isSelected
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : available && !isPast
                    ? 'hover:bg-indigo-50 border-gray-200'
                    : 'bg-gray-50 text-gray-400 cursor-not-allowed border-gray-100'
                }`}
              >
                <div className="text-xs font-medium">
                  {format(date, 'EEE')}
                </div>
                <div className="text-lg font-bold">{format(date, 'd')}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Time Selection */}
      {selectedDate && (
        <div>
          <Label className="mb-3 block">Select a Time</Label>
          {availableSlots.length === 0 ? (
            <p className="text-sm text-gray-600 text-center py-4">
              No available time slots for this date.
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {availableSlots.map((slot) => (
                <button
                  key={slot}
                  type="button"
                  onClick={() => setSelectedTime(slot)}
                  className={`p-3 rounded-lg border text-sm font-medium transition-colors ${
                    selectedTime === slot
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'hover:bg-indigo-50 border-gray-200'
                  }`}
                >
                  {slot}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Guest Information */}
      {selectedTime && (
        <div className="space-y-4 border-t pt-6">
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
            <Label htmlFor="guestPhone">Phone (optional)</Label>
            <Input
              id="guestPhone"
              type="tel"
              value={formData.guestPhone}
              onChange={(e) =>
                setFormData({ ...formData, guestPhone: e.target.value })
              }
              placeholder="+1 (555) 123-4567"
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
            </div>
          ))}

          <Button
            type="submit"
            disabled={isLoading}
            className="w-full bg-indigo-600 hover:bg-indigo-700"
          >
            {isLoading ? 'Creating Booking...' : 'Confirm Booking'}
          </Button>
        </div>
      )}
    </form>
  );
}
