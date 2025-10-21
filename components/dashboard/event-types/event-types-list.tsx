
'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';
import {
  Clock,
  MoreHorizontal,
  Edit,
  Trash,
  Calendar,
  MapPin,
  Video,
  Phone,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslation } from '@/lib/i18n/hooks';

interface EventType {
  id: string;
  name: string;
  duration: number;
  bufferTime: number;
  location: string;
  videoLink?: string;
  color: string;
  requiresConfirmation: boolean;
  bookingPage: {
    id: string;
    title: string;
    slug: string;
  };
  _count?: {
    bookings: number;
  };
  formFields: any[];
  createdAt: string;
}

export function EventTypesList() {
  const [eventTypes, setEventTypes] = useState<EventType[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const router = useRouter();
  const { t } = useTranslation();

  useEffect(() => {
    fetchEventTypes();
  }, []);

  const fetchEventTypes = async () => {
    try {
      const response = await fetch('/api/event-types');
      const data = await response.json();

      if (data.success) {
        setEventTypes(data.data);
      } else {
        toast({
          title: t('common.error'),
          description: t('eventTypes.loadFailed'),
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: t('common.error'),
        description: t('eventTypes.loadFailed'),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`${t('eventTypes.deleteConfirm')} "${name}"?`)) {
      return;
    }

    try {
      const response = await fetch(`/api/event-types/${id}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (data.success) {
        toast({
          title: t('common.success'),
          description: t('eventTypes.deleted'),
        });
        fetchEventTypes();
      } else {
        toast({
          title: t('common.error'),
          description: data.error || t('eventTypes.deleteFailed'),
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: t('common.error'),
        description: t('eventTypes.deleteFailed'),
        variant: 'destructive',
      });
    }
  };

  const getLocationIcon = (location: string) => {
    switch (location) {
      case 'video':
        return Video;
      case 'phone':
        return Phone;
      case 'in-person':
        return MapPin;
      default:
        return MapPin;
    }
  };

  const getLocationLabel = (location: string) => {
    switch (location) {
      case 'video':
        return t('eventTypes.videoCall');
      case 'phone':
        return t('eventTypes.phoneCall');
      case 'in-person':
        return t('eventTypes.inPerson');
      default:
        return location;
    }
  };

  if (loading) {
    return (
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {[...Array(6)].map((_, i) => (
          <Card key={i} className="animate-pulse">
            <CardHeader>
              <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
              <div className="h-3 bg-gray-200 rounded w-1/2"></div>
            </CardHeader>
            <CardContent>
              <div className="h-3 bg-gray-200 rounded w-full mb-2"></div>
              <div className="h-3 bg-gray-200 rounded w-2/3"></div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (eventTypes.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16">
          <Calendar className="h-16 w-16 text-gray-300 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">{t('eventTypes.noEventTypes')}</h3>
          <p className="text-gray-500 text-center mb-6 max-w-sm">
            {t('eventTypes.noEventTypesDesc')}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
      {eventTypes.map((eventType) => {
        const LocationIcon = getLocationIcon(eventType.location);
        
        return (
          <Card key={eventType.id} className="hover:shadow-md transition-shadow">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="flex items-center min-w-0 flex-1">
                  <div 
                    className="w-4 h-4 rounded mr-3 flex-shrink-0"
                    style={{ backgroundColor: eventType.color }}
                  />
                  <span className="truncate" title={eventType.name}>{eventType.name}</span>
                </CardTitle>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0 flex-shrink-0">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem asChild>
                      <Link href={`/dashboard/event-types/${eventType.id}`}>
                        <Edit className="mr-2 h-4 w-4" />
                        {t('common.edit')}
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => handleDelete(eventType.id, eventType.name)}
                      className="text-red-600"
                    >
                      <Trash className="mr-2 h-4 w-4" />
                      {t('common.delete')}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <div className="flex items-center space-x-2 flex-wrap">
                <Badge variant="outline" className="flex items-center whitespace-nowrap">
                  <Clock className="mr-1 h-3 w-3" />
                  {eventType.duration}m
                </Badge>
                <Badge variant="outline" className="flex items-center">
                  <LocationIcon className="mr-1 h-3 w-3 flex-shrink-0" />
                  <span className="truncate">{getLocationLabel(eventType.location)}</span>
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-2 mb-4">
                <p className="text-sm text-gray-600">
                  {t('eventTypes.bookingPage')}: <span className="font-medium truncate block">{eventType.bookingPage?.title || '-'}</span>
                </p>
                {eventType.bufferTime > 0 && (
                  <p className="text-sm text-gray-600">
                    {t('eventTypes.bufferTime')}: <span className="font-medium">{eventType.bufferTime}m</span>
                  </p>
                )}
                {eventType.requiresConfirmation && (
                  <Badge variant="secondary">{t('eventTypes.requiresConfirmation')}</Badge>
                )}
              </div>
              <div className="flex items-center justify-between text-sm text-gray-500">
                <div className="flex items-center">
                  <Calendar className="mr-1 h-4 w-4 flex-shrink-0" />
                  <span className="truncate">
                    {eventType._count?.bookings || 0} {(eventType._count?.bookings || 0) !== 1 ? t('eventTypes.bookings') : t('eventTypes.booking')}
                  </span>
                </div>
                <span className="text-xs whitespace-nowrap ml-2">
                  {new Date(eventType.createdAt).toLocaleDateString()}
                </span>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
