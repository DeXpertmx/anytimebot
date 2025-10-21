
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { isValidUsername } from '@/lib/utils';
import { Save, Loader2, Globe, Calendar, Clock, Plus, Trash2 } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface AvailabilitySlot {
  id?: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  isAvailable: boolean;
}

interface EditBookingPageFormProps {
  bookingPage: {
    id: string;
    title: string;
    slug: string;
    description?: string;
    isActive: boolean;
    slotInterval?: number;
    eventTypes: any[];
    availability: AvailabilitySlot[];
  };
}

const DAYS_OF_WEEK = [
  { value: 0, label: 'Sunday' },
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
];

const TIME_SLOTS = Array.from({ length: 48 }, (_, i) => {
  const hour = Math.floor(i / 2);
  const minute = i % 2 === 0 ? '00' : '30';
  const time24 = `${hour.toString().padStart(2, '0')}:${minute}`;
  return time24;
});

export function EditBookingPageForm({ bookingPage }: EditBookingPageFormProps) {
  const [formData, setFormData] = useState({
    title: bookingPage.title,
    slug: bookingPage.slug,
    description: bookingPage.description || '',
    isActive: bookingPage.isActive,
    slotInterval: bookingPage.slotInterval || 15,
  });
  const [availability, setAvailability] = useState<AvailabilitySlot[]>(
    bookingPage.availability.length > 0
      ? bookingPage.availability
      : [
          { dayOfWeek: 1, startTime: '09:00', endTime: '17:00', isAvailable: true },
          { dayOfWeek: 2, startTime: '09:00', endTime: '17:00', isAvailable: true },
          { dayOfWeek: 3, startTime: '09:00', endTime: '17:00', isAvailable: true },
          { dayOfWeek: 4, startTime: '09:00', endTime: '17:00', isAvailable: true },
          { dayOfWeek: 5, startTime: '09:00', endTime: '17:00', isAvailable: true },
        ]
  );
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const router = useRouter();

  const addAvailabilitySlot = () => {
    setAvailability([
      ...availability,
      { dayOfWeek: 1, startTime: '09:00', endTime: '17:00', isAvailable: true },
    ]);
  };

  const removeAvailabilitySlot = (index: number) => {
    setAvailability(availability.filter((_, i) => i !== index));
  };

  const updateAvailabilitySlot = (
    index: number,
    field: keyof AvailabilitySlot,
    value: any
  ) => {
    const updated = [...availability];
    updated[index] = { ...updated[index], [field]: value };
    setAvailability(updated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Validation
      if (!formData.title.trim() || !formData.slug.trim()) {
        toast({
          title: 'Error',
          description: 'Title and slug are required',
          variant: 'destructive',
        });
        setLoading(false);
        return;
      }

      if (!isValidUsername(formData.slug)) {
        toast({
          title: 'Error',
          description: 'Slug can only contain letters, numbers, hyphens, and underscores',
          variant: 'destructive',
        });
        setLoading(false);
        return;
      }

      // Validate availability
      if (availability.length === 0) {
        toast({
          title: 'Error',
          description: 'Please add at least one availability slot',
          variant: 'destructive',
        });
        setLoading(false);
        return;
      }

      // Update booking page
      const response = await fetch(`/api/booking-pages/${bookingPage.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ...formData, availability }),
      });

      const data = await response.json();

      if (data.success) {
        toast({
          title: 'Success',
          description: 'Booking page updated successfully',
        });
        router.refresh();
      } else {
        toast({
          title: 'Error',
          description: data.error || 'Failed to update booking page',
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Something went wrong',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Statistics */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="flex items-center p-6">
            <div className="flex items-center">
              <Globe className="h-8 w-8 text-indigo-600 mr-4" />
              <div>
                <p className="text-sm font-medium text-gray-600">Status</p>
                <Badge variant={formData.isActive ? 'default' : 'secondary'} className="mt-1">
                  {formData.isActive ? 'Active' : 'Inactive'}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="flex items-center p-6">
            <div className="flex items-center">
              <Calendar className="h-8 w-8 text-green-600 mr-4" />
              <div>
                <p className="text-sm font-medium text-gray-600">Event Types</p>
                <p className="text-2xl font-bold text-gray-900">{bookingPage.eventTypes.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="flex items-center p-6">
            <div className="flex items-center">
              <Clock className="h-8 w-8 text-blue-600 mr-4" />
              <div>
                <p className="text-sm font-medium text-gray-600">Availability</p>
                <p className="text-2xl font-bold text-gray-900">{availability.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Edit Form */}
        <Card>
          <CardHeader>
            <CardTitle>Page Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="title">Page Title</Label>
              <Input
                id="title"
                placeholder="e.g., Schedule a Meeting with John"
                value={formData.title}
                onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                required
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="slug">URL Slug</Label>
              <div className="flex items-center">
                <span className="text-sm text-gray-500 mr-1">
                  {typeof window !== 'undefined' ? window.location.origin : ''}/username/
                </span>
                <Input
                  id="slug"
                  placeholder="your-page"
                  value={formData.slug}
                  onChange={(e) => setFormData(prev => ({ ...prev, slug: e.target.value }))}
                  required
                />
              </div>
              <p className="text-xs text-gray-500">
                This will be your booking page URL. Use only letters, numbers, hyphens, and underscores.
              </p>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="description">Description (Optional)</Label>
              <Textarea
                id="description"
                placeholder="Tell your clients what they can book..."
                rows={4}
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="slotInterval">Time Slot Interval</Label>
              <Select
                value={formData.slotInterval.toString()}
                onValueChange={(value) => 
                  setFormData(prev => ({ ...prev, slotInterval: parseInt(value) }))
                }
              >
                <SelectTrigger id="slotInterval">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="15">15 minutos</SelectItem>
                  <SelectItem value="30">30 minutos</SelectItem>
                  <SelectItem value="60">60 minutos</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-500">
                Los horarios disponibles se mostrarán en intervalos de este tiempo
              </p>
            </div>

            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div className="space-y-0.5">
                <Label htmlFor="is-active" className="text-base">Active Status</Label>
                <p className="text-sm text-gray-500">
                  Make this page available for bookings
                </p>
              </div>
              <Switch
                id="is-active"
                checked={formData.isActive}
                onCheckedChange={(checked) => 
                  setFormData(prev => ({ ...prev, isActive: checked }))
                }
              />
            </div>
          </CardContent>
        </Card>

        {/* Availability Settings */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Availability Schedule</CardTitle>
                <p className="text-sm text-gray-600 mt-1">
                  Set your working hours for this booking page
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addAvailabilitySlot}
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Slot
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {availability.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Clock className="h-12 w-12 mx-auto mb-3 text-gray-400" />
                  <p>No availability slots configured.</p>
                  <p className="text-sm mt-1">Click "Add Slot" to get started.</p>
                </div>
              ) : (
                availability.map((slot, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-4 p-4 border rounded-lg bg-gray-50"
                  >
                    <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <Label className="text-xs">Day of Week</Label>
                        <Select
                          value={slot.dayOfWeek.toString()}
                          onValueChange={(value) =>
                            updateAvailabilitySlot(index, 'dayOfWeek', parseInt(value))
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {DAYS_OF_WEEK.map((day) => (
                              <SelectItem key={day.value} value={day.value.toString()}>
                                {day.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div>
                        <Label className="text-xs">Start Time</Label>
                        <Select
                          value={slot.startTime}
                          onValueChange={(value) =>
                            updateAvailabilitySlot(index, 'startTime', value)
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {TIME_SLOTS.map((time) => (
                              <SelectItem key={time} value={time}>
                                {time}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div>
                        <Label className="text-xs">End Time</Label>
                        <Select
                          value={slot.endTime}
                          onValueChange={(value) =>
                            updateAvailabilitySlot(index, 'endTime', value)
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {TIME_SLOTS.map((time) => (
                              <SelectItem key={time} value={time}>
                                {time}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeAvailabilitySlot(index)}
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button 
            type="submit" 
            disabled={loading}
            className="bg-indigo-600 hover:bg-indigo-700"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Save All Changes
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
