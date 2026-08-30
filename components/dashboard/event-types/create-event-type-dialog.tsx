
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
import { useTranslation } from '@/lib/i18n/hooks';
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
    videoProvider: 'DAILY',
    color: '#6366f1',
    requiresConfirmation: false,
    price: '0',
    currency: 'usd',
    collectPayment: false,
    teamId: null as string | null,
    assignmentMode: 'individual',
  });
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const { t } = useTranslation();
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
          title: t('common.error'),
          description: t('eventTypes.nameAndPageRequired'),
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
          title: t('common.success'),
          description: t('eventTypes.created'),
        });
        setOpen(false);
        setFormData({
          bookingPageId: '',
          name: '',
          duration: '30',
          bufferTime: '5',
          location: 'video',
          videoLink: '',
          videoProvider: 'DAILY',
          color: '#6366f1',
          requiresConfirmation: false,
          price: '0',
          currency: 'usd',
          collectPayment: false,
          teamId: null,
          assignmentMode: 'individual',
        });
        router.refresh();
      } else {
        toast({
          title: t('common.error'),
          description: data.error || t('eventTypes.createFailed'),
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: t('common.error'),
        description: t('eventTypes.createFailed'),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const durationOptions = [
    { value: '15', label: t('eventTypes.durationMinutes', { count: 15 }) },
    { value: '30', label: t('eventTypes.durationMinutes', { count: 30 }) },
    { value: '45', label: t('eventTypes.durationMinutes', { count: 45 }) },
    { value: '60', label: t('eventTypes.oneHour') },
    { value: '90', label: t('eventTypes.hourAndHalf') },
    { value: '120', label: t('eventTypes.twoHours') },
  ];

  const bufferTimeOptions = [
    { value: '0', label: t('eventTypes.noBuffer') },
    { value: '5', label: t('eventTypes.durationMinutes', { count: 5 }) },
    { value: '10', label: t('eventTypes.durationMinutes', { count: 10 }) },
    { value: '15', label: t('eventTypes.durationMinutes', { count: 15 }) },
    { value: '30', label: t('eventTypes.durationMinutes', { count: 30 }) },
  ];

  const locationOptions = [
    { value: 'video', label: t('eventTypes.videoCall') },
    { value: 'phone', label: t('eventTypes.phoneCall') },
    { value: 'in-person', label: t('eventTypes.inPerson') },
  ];

  const videoProviderOptions = [
    { value: 'DAILY', label: t('eventTypes.dailyRecommended') },
    { value: 'GOOGLE_MEET', label: t('eventTypes.googleMeet') },
    { value: 'ZOOM', label: t('eventTypes.zoom') },
    { value: 'TEAMS', label: t('eventTypes.teams') },
    { value: 'CUSTOM', label: t('eventTypes.custom') },
  ];

  const currencyOptions = [
    { value: 'usd', label: t('eventTypes.currencyUsd') },
    { value: 'eur', label: t('eventTypes.currencyEur') },
    { value: 'mxn', label: t('eventTypes.currencyMxn') },
    { value: 'gbp', label: t('eventTypes.currencyGbp') },
  ];

  const colors = getEventTypeColors();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('eventTypes.create')}</DialogTitle>
          <DialogDescription>
            {t('eventTypes.createDescription')}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="bookingPage">{t('eventTypes.bookingPage')}</Label>
            <Select
              value={formData.bookingPageId || "all"}
              onValueChange={(value) => 
                setFormData(prev => ({ ...prev, bookingPageId: value }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder={t('eventTypes.bookingPageSelect')} />
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
            <Label htmlFor="name">{t('eventTypes.name')}</Label>
            <Input
              id="name"
              placeholder={t('eventTypes.namePlaceholder')}
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="duration">{t('eventTypes.duration')}</Label>
              <Select
                value={formData.duration || "30"}
                onValueChange={(value) => 
                  setFormData(prev => ({ ...prev, duration: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('eventTypes.selectDuration')} />
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
              <Label htmlFor="bufferTime">{t('eventTypes.bufferTime')}</Label>
              <Select
                value={formData.bufferTime || "5"}
                onValueChange={(value) => 
                  setFormData(prev => ({ ...prev, bufferTime: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('eventTypes.selectBufferTime')} />
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
            <Label htmlFor="location">{t('eventTypes.location')}</Label>
            <Select
              value={formData.location || "video"}
              onValueChange={(value) => 
                setFormData(prev => ({ ...prev, location: value }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder={t('eventTypes.selectLocation')} />
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
            <>
              <div className="space-y-2">
                <Label htmlFor="videoProvider">{t('eventTypes.videoProvider')}</Label>
                <Select
                  value={formData.videoProvider}
                  onValueChange={(value) => 
                    setFormData(prev => ({ ...prev, videoProvider: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('eventTypes.selectVideoProvider')} />
                  </SelectTrigger>
                  <SelectContent>
                    {videoProviderOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-gray-500">
                  {t('eventTypes.videoProviderHint')}
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="videoLink">{t('eventTypes.videoLink')}</Label>
                <Input
                  id="videoLink"
                  placeholder="https://zoom.us/j/123456789"
                  value={formData.videoLink}
                  onChange={(e) => setFormData(prev => ({ ...prev, videoLink: e.target.value }))}
                />
              </div>
            </>
          )}

          <div className="space-y-2">
            <Label>{t('eventTypes.color')}</Label>
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
                {t('eventTypes.requiresConfirmation')}
              </Label>
              <p className="text-sm text-gray-500">
                {t('eventTypes.requiresConfirmationDesc')}
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

          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
            <div className="space-y-0.5">
              <Label htmlFor="collect-payment" className="text-base">
                {t('eventTypes.collectPayment')}
              </Label>
              <p className="text-sm text-gray-500">
                {t('eventTypes.collectPaymentDesc')}
              </p>
            </div>
            <Switch
              id="collect-payment"
              checked={formData.collectPayment}
              onCheckedChange={(checked) => 
                setFormData(prev => ({ ...prev, collectPayment: checked }))
              }
            />
          </div>

          {formData.collectPayment && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="price">{t('eventTypes.price')}</Label>
                <Input
                  id="price"
                  type="number"
                  min="0"
                  placeholder="0"
                  value={formData.price}
                  onChange={(e) => setFormData(prev => ({ ...prev, price: e.target.value }))}
                />
                <p className="text-xs text-gray-500">
                  {t('eventTypes.priceHint')}
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="currency">{t('eventTypes.currency')}</Label>
                <Select
                  value={formData.currency}
                  onValueChange={(value) => 
                    setFormData(prev => ({ ...prev, currency: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('eventTypes.currency')} />
                  </SelectTrigger>
                  <SelectContent>
                    {currencyOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button 
              type="submit" 
              disabled={loading}
              className="bg-indigo-600 hover:bg-indigo-700"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  {t('eventTypes.creating')}
                </>
              ) : (
                t('eventTypes.create')
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
