
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { getEventTypeColors } from '@/lib/utils';
import { Loader2, Palette } from 'lucide-react';
import { TeamAssignmentSelector } from './team-assignment-selector';

interface CreateEventTypeDialogProps {
  children: React.ReactNode;
}

interface BookingPage {
  id: string;
  title: string;
  slug: string;
}

export function CreateEventTypeDialog({ children }: CreateEventTypeDialogProps) {
  const [open, setOpen] = useState(false);
  const [bookingPages, setBookingPages] = useState<BookingPage[]>([]);
  const [formData, setFormData] = useState({
    bookingPageId: '',
    name: '',
    duration: '30',
    bufferTime: '5',
    location: 'video',
    videoLink: '',
    color: '#6366f1',
    requiresConfirmation: false,
    teamId: null as string | null,
    assignmentMode: 'individual',
  });
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const router = useRouter();

  useEffect(() => {
    if (open) {
      fetchBookingPages();
    }
  }, [open]);

  const fetchBookingPages = async () => {
    try {
      const response = await fetch('/api/booking-pages');
      const data = await response.json();
      
      if (data.success) {
        setBookingPages(data.data);
        // Auto-select first booking page if available
        if (data.data.length > 0 && !formData.bookingPageId) {
          setFormData(prev => ({ ...prev, bookingPageId: data.data[0].id }));
        }
      }
    } catch (error) {
      console.error('Error fetching booking pages:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Validation
      if (!formData.name.trim() || !formData.bookingPageId) {
        toast({
          title: 'Error',
          description: 'Name and booking page are required',
          variant: 'destructive',
        });
        return;
      }

      const response = await fetch('/api/event-types', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...formData,
          duration: parseInt(formData.duration),
          bufferTime: parseInt(formData.bufferTime),
        }),
      });

      const data = await response.json();

      if (data.success) {
        toast({
          title: 'Success',
          description: 'Event type created successfully',
        });
        setOpen(false);
        setFormData({
          bookingPageId: '',
          name: '',
          duration: '30',
          bufferTime: '5',
          location: 'video',
          videoLink: '',
          color: '#6366f1',
          requiresConfirmation: false,
          teamId: null,
          assignmentMode: 'individual',
        });
        router.refresh();
      } else {
        toast({
          title: 'Error',
          description: data.error || 'Failed to create event type',
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

  const durationOptions = [
    { value: '15', label: '15 minutes' },
    { value: '30', label: '30 minutes' },
    { value: '45', label: '45 minutes' },
    { value: '60', label: '1 hour' },
    { value: '90', label: '1.5 hours' },
    { value: '120', label: '2 hours' },
  ];

  const bufferTimeOptions = [
    { value: '0', label: 'No buffer' },
    { value: '5', label: '5 minutes' },
    { value: '10', label: '10 minutes' },
    { value: '15', label: '15 minutes' },
    { value: '30', label: '30 minutes' },
  ];

  const locationOptions = [
    { value: 'video', label: 'Video Call' },
    { value: 'phone', label: 'Phone Call' },
    { value: 'in-person', label: 'In Person' },
  ];

  const colors = getEventTypeColors();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Event Type</DialogTitle>
          <DialogDescription>
            Create a new type of meeting that clients can book.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="bookingPage">Booking Page</Label>
            <Select
              value={formData.bookingPageId || "all"}
              onValueChange={(value) => 
                setFormData(prev => ({ ...prev, bookingPageId: value }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a booking page" />
              </SelectTrigger>
              <SelectContent>
                {bookingPages.map((page) => (
                  <SelectItem key={page.id} value={page.id}>
                    {page.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="name">Event Name</Label>
            <Input
              id="name"
              placeholder="e.g., 30 Minute Meeting"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="duration">Duration</Label>
              <Select
                value={formData.duration || "30"}
                onValueChange={(value) => 
                  setFormData(prev => ({ ...prev, duration: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select duration" />
                </SelectTrigger>
                <SelectContent>
                  {durationOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="bufferTime">Buffer Time</Label>
              <Select
                value={formData.bufferTime || "5"}
                onValueChange={(value) => 
                  setFormData(prev => ({ ...prev, bufferTime: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select buffer time" />
                </SelectTrigger>
                <SelectContent>
                  {bufferTimeOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="location">Location</Label>
            <Select
              value={formData.location || "video"}
              onValueChange={(value) => 
                setFormData(prev => ({ ...prev, location: value }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Select location type" />
              </SelectTrigger>
              <SelectContent>
                {locationOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {formData.location === 'video' && (
            <div className="space-y-2">
              <Label htmlFor="videoLink">Video Link (Optional)</Label>
              <Input
                id="videoLink"
                placeholder="e.g., https://zoom.us/j/123456789"
                value={formData.videoLink}
                onChange={(e) => setFormData(prev => ({ ...prev, videoLink: e.target.value }))}
              />
            </div>
          )}

          <div className="space-y-2">
            <Label>Color</Label>
            <div className="flex items-center space-x-2">
              <Palette className="h-4 w-4 text-gray-500" />
              <div className="flex space-x-2">
                {colors.map((color) => (
                  <button
                    key={color}
                    type="button"
                    className={`w-6 h-6 rounded-full border-2 ${
                      formData.color === color ? 'border-gray-900' : 'border-gray-200'
                    }`}
                    style={{ backgroundColor: color }}
                    onClick={() => setFormData(prev => ({ ...prev, color }))}
                  />
                ))}
              </div>
            </div>
          </div>

          <TeamAssignmentSelector
            teamId={formData.teamId || undefined}
            assignmentMode={formData.assignmentMode}
            onTeamChange={(teamId) => setFormData(prev => ({ ...prev, teamId }))}
            onAssignmentModeChange={(assignmentMode) => setFormData(prev => ({ ...prev, assignmentMode }))}
          />

          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
            <div className="space-y-0.5">
              <Label htmlFor="requires-confirmation" className="text-base">
                Requires Confirmation
              </Label>
              <p className="text-sm text-gray-500">
                Manually approve each booking request
              </p>
            </div>
            <Switch
              id="requires-confirmation"
              checked={formData.requiresConfirmation}
              onCheckedChange={(checked) => 
                setFormData(prev => ({ ...prev, requiresConfirmation: checked }))
              }
            />
          </div>
          
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button 
              type="submit" 
              disabled={loading}
              className="bg-indigo-600 hover:bg-indigo-700"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Creating...
                </>
              ) : (
                'Create Event Type'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
