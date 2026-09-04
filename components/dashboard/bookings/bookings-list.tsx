
'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { format } from 'date-fns';
import { Calendar, Clock, MapPin, Sofa, Video, Phone, User, Mail, MoreVertical, Eye, Lightbulb, CheckCircle2 } from 'lucide-react';
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
import { toast } from 'react-hot-toast';

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
  resourceName?: string | null;
  locationName?: string | null;
  locationAddress?: string | null;
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
  PENDING: 'Pendiente',
  CONFIRMED: 'Confirmada',
  CANCELLED: 'Cancelada',
  COMPLETED: 'Completada',
};

export function BookingsList({ bookings }: BookingsListProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedStatus = searchParams.get('status');
  const initialTab =
    requestedStatus && ['pending', 'confirmed', 'upcoming', 'past'].includes(requestedStatus)
      ? requestedStatus
      : 'all';
  const [selectedTab, setSelectedTab] = useState(initialTab);

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

  const handleStatusChange = async (bookingId: string, status: 'CONFIRMED' | 'CANCELLED' | 'COMPLETED') => {
    const message =
      status === 'CANCELLED'
        ? '¿Seguro que quieres cancelar esta reserva? El cliente recibirá un aviso de cancelación.'
        : status === 'COMPLETED'
          ? '¿Marcar esta reserva como finalizada? Podrás añadir notas o un resumen desde el detalle.'
          : '¿Confirmar esta reserva? El cliente recibirá la confirmación con los detalles de la cita.';
    if (!window.confirm(message)) return;

    try {
      const response = await fetch(`/api/bookings/${bookingId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });

      const data = await response.json();
      if (response.ok && data.success) {
        const successMsg =
          status === 'CONFIRMED'
            ? 'Reserva confirmada. El cliente recibirá el correo y el mensaje con los detalles.'
            : status === 'COMPLETED'
              ? 'Reserva finalizada correctamente.'
              : 'Reserva cancelada. El cliente recibirá el aviso de cancelación.';
        toast.success(successMsg);
        window.location.reload();
      } else {
        toast.error(data?.error || 'No se pudo actualizar la reserva');
      }
    } catch (error) {
      console.error('Error updating booking:', error);
      toast.error('Error al actualizar la reserva');
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
          <TabsTrigger value="all">Todas</TabsTrigger>
          <TabsTrigger value="upcoming">Próximas</TabsTrigger>
          <TabsTrigger value="pending">Pendientes</TabsTrigger>
          <TabsTrigger value="confirmed">Confirmadas</TabsTrigger>
          <TabsTrigger value="past">Pasadas</TabsTrigger>
        </TabsList>

        <TabsContent value={selectedTab} className="mt-6 space-y-4">
          {filteredBookings.length === 0 ? (
            <Card className="p-12">
              <div className="text-center">
                <Calendar className="mx-auto h-12 w-12 text-gray-400" />
                <h3 className="mt-4 text-lg font-semibold text-gray-900">
                  No se encontraron reservas
                </h3>
                <p className="mt-2 text-sm text-gray-600">
                  {selectedTab === 'all'
                    ? 'Aún no tienes reservas.'
                    : `No hay reservas ${selectedTab}.`}
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
                              Unirse
                            </a>
                          )}
                        </div>
                        {(booking.resourceName || booking.locationName) && (
                          <div className="rounded-lg border border-indigo-100 bg-indigo-50/60 px-3 py-2">
                            <p className="flex items-center text-sm font-medium text-indigo-900">
                              <Sofa className="h-4 w-4 mr-2 text-indigo-500" />
                              {booking.resourceName || 'Recurso asignado'}
                            </p>
                            {(booking.locationName || booking.locationAddress) && (
                              <p className="mt-0.5 flex items-center text-xs text-indigo-700/80">
                                <MapPin className="h-3.5 w-3.5 mr-1.5" />
                                {[booking.locationName, booking.locationAddress].filter(Boolean).join(' · ')}
                              </p>
                            )}
                          </div>
                        )}
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
                        Ver detalles y resumen
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
                        Ver detalles
                      </DropdownMenuItem>
                      {booking.status === 'PENDING' && (
                        <DropdownMenuItem
                          onClick={() => handleStatusChange(booking.id, 'CONFIRMED')}
                        >
                          <CheckCircle2 className="h-4 w-4 mr-2 text-emerald-600" />
                          Confirmar reserva
                        </DropdownMenuItem>
                      )}
                      {booking.status === 'CONFIRMED' && (
                        <DropdownMenuItem
                          onClick={() => handleStatusChange(booking.id, 'COMPLETED')}
                        >
                          <CheckCircle2 className="h-4 w-4 mr-2 text-indigo-600" />
                          Finalizar cita
                        </DropdownMenuItem>
                      )}
                      {(booking.status === 'PENDING' || booking.status === 'CONFIRMED') && (
                        <DropdownMenuItem
                          onClick={() => handleStatusChange(booking.id, 'CANCELLED')}
                          className="text-red-600"
                        >
                          Cancelar reserva
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
