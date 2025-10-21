
/**
 * Booking Details Modal
 * Shows detailed information about a booking including briefings
 */

'use client';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Calendar, Clock, MapPin, User, Mail, Phone, FileText } from 'lucide-react';
import { BriefingCard } from './briefing-card';
import { useState, useEffect } from 'react';

interface Booking {
  id: string;
  guestName: string;
  guestEmail: string;
  guestPhone?: string | null;
  startTime: string | Date;
  endTime: string | Date;
  status: string;
  eventType: {
    name: string;
    duration: number;
    location: string;
    videoLink?: string | null;
  };
  formData?: any;
}

interface BookingDetailsModalProps {
  booking: Booking | null;
  isOpen: boolean;
  onClose: () => void;
}

export function BookingDetailsModal({ booking, isOpen, onClose }: BookingDetailsModalProps) {
  const [briefing, setBriefing] = useState<any>(null);
  const [isLoadingBriefing, setIsLoadingBriefing] = useState(false);

  useEffect(() => {
    if (booking && isOpen) {
      fetchBriefing();
    }
  }, [booking?.id, isOpen]);

  const fetchBriefing = async () => {
    if (!booking) return;

    try {
      setIsLoadingBriefing(true);
      const response = await fetch(`/api/briefings/${booking.id}`);
      
      if (response.ok) {
        const data = await response.json();
        setBriefing(data);
      } else {
        setBriefing(null);
      }
    } catch (error) {
      console.error('Error fetching briefing:', error);
      setBriefing(null);
    } finally {
      setIsLoadingBriefing(false);
    }
  };

  if (!booking) return null;

  const statusColors: Record<string, string> = {
    CONFIRMED: 'bg-green-100 text-green-800',
    PENDING: 'bg-yellow-100 text-yellow-800',
    CANCELLED: 'bg-red-100 text-red-800',
    COMPLETED: 'bg-blue-100 text-blue-800',
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl">Booking Details</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Status Badge */}
          <div className="flex items-center justify-between">
            <Badge className={statusColors[booking.status] || 'bg-gray-100 text-gray-800'}>
              {booking.status}
            </Badge>
            <span className="text-sm text-muted-foreground">
              Booking ID: {booking.id.slice(0, 8)}...
            </span>
          </div>

          {/* Event Information */}
          <div className="bg-gradient-to-r from-purple-50 to-indigo-50 p-4 rounded-lg border border-purple-100">
            <h3 className="font-semibold text-lg mb-3 flex items-center gap-2">
              <Calendar className="h-5 w-5 text-purple-600" />
              {booking.eventType.name}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              <div className="flex items-center gap-2 text-gray-700">
                <Clock className="h-4 w-4 text-purple-500" />
                <span>
                  {new Date(booking.startTime).toLocaleString()} ({booking.eventType.duration} min)
                </span>
              </div>
              <div className="flex items-center gap-2 text-gray-700">
                <MapPin className="h-4 w-4 text-purple-500" />
                <span>{booking.eventType.location}</span>
              </div>
            </div>
            {booking.eventType.videoLink && (
              <div className="mt-3">
                <Button asChild variant="outline" size="sm">
                  <a href={booking.eventType.videoLink} target="_blank" rel="noopener noreferrer">
                    Join Meeting
                  </a>
                </Button>
              </div>
            )}
          </div>

          <Separator />

          {/* Guest Information */}
          <div>
            <h3 className="font-semibold text-lg mb-3 flex items-center gap-2">
              <User className="h-5 w-5" />
              Guest Information
            </h3>
            <div className="grid gap-2 text-sm">
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-gray-400" />
                <span className="font-medium">{booking.guestName}</span>
              </div>
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-gray-400" />
                <a href={`mailto:${booking.guestEmail}`} className="text-blue-600 hover:underline">
                  {booking.guestEmail}
                </a>
              </div>
              {booking.guestPhone && (
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-gray-400" />
                  <a href={`tel:${booking.guestPhone}`} className="text-blue-600 hover:underline">
                    {booking.guestPhone}
                  </a>
                </div>
              )}
            </div>
          </div>

          {/* Form Responses */}
          {booking.formData && Object.keys(booking.formData).length > 0 && (
            <>
              <Separator />
              <div>
                <h3 className="font-semibold text-lg mb-3 flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Form Responses
                </h3>
                <div className="bg-gray-50 p-4 rounded-lg space-y-2">
                  {Object.entries(booking.formData).map(([key, value]) => (
                    <div key={key} className="text-sm">
                      <span className="font-medium text-gray-700">{key}:</span>{' '}
                      <span className="text-gray-600">{String(value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          <Separator />

          {/* Pre-Meeting Intelligence */}
          <div>
            <BriefingCard
              briefing={briefing}
              bookingId={booking.id}
              viewAs="host"
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
