
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { Calendar, Clock, MapPin, Video, Phone, User, Mail, MoreVertical, Eye, Lightbulb } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

type BookingStatus = 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'COMPLETED';

interface Booking {
  id: string;
  guestName: string;
  guestEmail: string;
  guestPhone?: string | null;
  startTime: Date;
  endTime: Date;
  timezone: string;
  status: BookingStatus;
  eventType: {
    name: string;
    duration: number;
    location: string;
    videoLink?: string | null;
  };
  bookingPage: {
    title: string;
    slug: string;
  };
}

interface BookingsListProps {
  bookings: Booking[];
}

const statusColors = {
  PENDING: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  CONFIRMED: 'bg-green-100 text-green-800 border-green-200',
  CANCELLED: 'bg-red-100 text-red-800 border-red-200',
  COMPLETED: 'bg-gray-100 text-gray-800 border-gray-200',
};

const statusLabels = {
  PENDING: 'Pending',
  CONFIRMED: 'Confirmed',
  CANCELLED: 'Cancelled',
  COMPLETED: 'Completed',
};

export function BookingsList({ bookings }: BookingsListProps) {
  const router = useRouter();
  const [selectedTab, setSelectedTab] = useState('all');

  const filteredBookings = bookings.filter((booking) => {
    if (selectedTab === 'all') return true;
    if (selectedTab === 'upcoming') {
      return (
        new Date(booking.startTime) > new Date() &&
        booking.status !== 'CANCELLED'
      );
    }
    if (selectedTab === 'past') {
      return new Date(booking.endTime) < new Date();
    }
    return booking.status.toLowerCase() === selectedTab;
  });

  const handleCancelBooking = async (bookingId: string) => {
    try {
      const response = await fetch(`/api/bookings/${bookingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'CANCELLED' }),
      });

      if (response.ok) {
        window.location.reload();
      }
    } catch (error) {
      console.error('Error cancelling booking:', error);
    }
  };

  const handleViewDetails = (bookingId: string) => {
    router.push(`/dashboard/bookings/${bookingId}`);
  };

  const getLocationIcon = (location: string) => {
    switch (location) {
      case 'video':
        return <Video className="h-4 w-4" />;
      case 'phone':
        return <Phone className="h-4 w-4" />;
      case 'in-person':
        return <MapPin className="h-4 w-4" />;
      default:
        return <MapPin className="h-4 w-4" />;
    }
  };

  return (
    <div className="space-y-4">
      <Tabs value={selectedTab} onValueChange={setSelectedTab}>
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
          <TabsTrigger value="pending">Pending</TabsTrigger>
          <TabsTrigger value="confirmed">Confirmed</TabsTrigger>
          <TabsTrigger value="past">Past</TabsTrigger>
        </TabsList>

        <TabsContent value={selectedTab} className="mt-6 space-y-4">
          {filteredBookings.length === 0 ? (
            <Card className="p-12">
              <div className="text-center">
                <Calendar className="mx-auto h-12 w-12 text-gray-400" />
                <h3 className="mt-4 text-lg font-semibold text-gray-900">
                  No bookings found
                </h3>
                <p className="mt-2 text-sm text-gray-600">
                  {selectedTab === 'all'
                    ? 'You don\'t have any bookings yet.'
                    : `No ${selectedTab} bookings.`}
                </p>
              </div>
            </Card>
          ) : (
            filteredBookings.map((booking) => (
              <Card key={booking.id} className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1 space-y-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900">
                          {booking.eventType.name}
                        </h3>
                        <p className="text-sm text-gray-600 mt-1">
                          {booking.bookingPage.title}
                        </p>
                      </div>
                      <Badge
                        variant="outline"
                        className={statusColors[booking.status]}
                      >
                        {statusLabels[booking.status]}
                      </Badge>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-3">
                        <div className="flex items-center text-sm text-gray-600">
                          <User className="h-4 w-4 mr-2" />
                          <span className="font-medium">{booking.guestName}</span>
                        </div>
                        <div className="flex items-center text-sm text-gray-600">
                          <Mail className="h-4 w-4 mr-2" />
                          <span>{booking.guestEmail}</span>
                        </div>
                        {booking.guestPhone && (
                          <div className="flex items-center text-sm text-gray-600">
                            <Phone className="h-4 w-4 mr-2" />
                            <span>{booking.guestPhone}</span>
                          </div>
                        )}
                      </div>

                      <div className="space-y-3">
                        <div className="flex items-center text-sm text-gray-600">
                          <Calendar className="h-4 w-4 mr-2" />
                          <span>
                            {format(new Date(booking.startTime), 'PPP')}
                          </span>
                        </div>
                        <div className="flex items-center text-sm text-gray-600">
                          <Clock className="h-4 w-4 mr-2" />
                          <span>
                            {format(new Date(booking.startTime), 'p')} -{' '}
                            {format(new Date(booking.endTime), 'p')}{' '}
                            ({booking.timezone})
                          </span>
                        </div>
                        <div className="flex items-center text-sm text-gray-600">
                          {getLocationIcon(booking.eventType.location)}
                          <span className="ml-2 capitalize">
                            {booking.eventType.location}
                          </span>
                          {booking.eventType.videoLink && (
                            <a
                              href={booking.eventType.videoLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="ml-2 text-indigo-600 hover:text-indigo-700 underline"
                            >
                              Join
                            </a>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex gap-2 mt-4">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleViewDetails(booking.id)}
                        className="flex items-center gap-2"
                      >
                        <Eye className="h-4 w-4" />
                        View Details & Briefing
                      </Button>
                    </div>
                  </div>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="ml-4">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handleViewDetails(booking.id)}>
                        <Eye className="h-4 w-4 mr-2" />
                        View Details
                      </DropdownMenuItem>
                      {booking.status === 'PENDING' && (
                        <DropdownMenuItem
                          onClick={() => handleCancelBooking(booking.id)}
                          className="text-red-600"
                        >
                          Cancel Booking
                        </DropdownMenuItem>
                      )}
                      {booking.status === 'CONFIRMED' && (
                        <DropdownMenuItem
                          onClick={() => handleCancelBooking(booking.id)}
                          className="text-red-600"
                        >
                          Cancel Booking
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </Card>
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
