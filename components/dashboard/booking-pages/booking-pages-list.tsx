
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
  Globe,
  MoreHorizontal,
  Edit,
  ExternalLink,
  Trash,
  Calendar,
  Copy,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface BookingPage {
  id: string;
  slug: string;
  title: string;
  description?: string;
  isActive: boolean;
  eventTypes: any[];
  _count: {
    eventTypes: number;
  };
  createdAt: string;
}

export function BookingPagesList() {
  const [bookingPages, setBookingPages] = useState<BookingPage[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const router = useRouter();

  useEffect(() => {
    fetchBookingPages();
  }, []);

  const fetchBookingPages = async () => {
    try {
      const response = await fetch('/api/booking-pages');
      const data = await response.json();

      if (data.success) {
        setBookingPages(data.data);
      } else {
        toast({
          title: 'Error',
          description: 'Failed to load booking pages',
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

  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`Are you sure you want to delete "${title}"?`)) {
      return;
    }

    try {
      const response = await fetch(`/api/booking-pages/${id}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (data.success) {
        toast({
          title: 'Success',
          description: 'Booking page deleted successfully',
        });
        fetchBookingPages();
      } else {
        toast({
          title: 'Error',
          description: data.error || 'Failed to delete booking page',
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Something went wrong',
        variant: 'destructive',
      });
    }
  };

  const copyBookingUrl = (slug: string) => {
    const url = `${window.location.origin}/${slug}`;
    navigator.clipboard.writeText(url);
    toast({
      title: 'Copied!',
      description: 'Booking page URL copied to clipboard',
    });
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

  if (bookingPages.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16">
          <Globe className="h-16 w-16 text-gray-300 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No booking pages yet</h3>
          <p className="text-gray-500 text-center mb-6 max-w-sm">
            Create your first booking page to start accepting appointments
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
      {bookingPages.map((page) => (
        <Card key={page.id} className="hover:shadow-md transition-shadow">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center">
                <Globe className="mr-2 h-5 w-5 text-indigo-600" />
                <span className="truncate">{page.title}</span>
              </CardTitle>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem asChild>
                    <Link href={`/dashboard/booking-pages/${page.id}`}>
                      <Edit className="mr-2 h-4 w-4" />
                      Edit
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href={`/${page.slug}`} target="_blank">
                      <ExternalLink className="mr-2 h-4 w-4" />
                      View Page
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => copyBookingUrl(page.slug)}>
                    <Copy className="mr-2 h-4 w-4" />
                    Copy URL
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => handleDelete(page.id, page.title)}
                    className="text-red-600"
                  >
                    <Trash className="mr-2 h-4 w-4" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <div className="flex items-center space-x-2">
              <Badge variant={page.isActive ? 'default' : 'secondary'}>
                {page.isActive ? 'Active' : 'Inactive'}
              </Badge>
              <span className="text-sm text-gray-500">/{page.slug}</span>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-sm text-gray-600 mb-4 line-clamp-2">
              {page.description || 'No description'}
            </p>
            <div className="flex items-center justify-between text-sm text-gray-500">
              <div className="flex items-center">
                <Calendar className="mr-1 h-4 w-4" />
                {page._count?.eventTypes || page.eventTypes?.length || 0} event type
                {(page._count?.eventTypes || page.eventTypes?.length) !== 1 ? 's' : ''}
              </div>
              <span>
                {new Date(page.createdAt).toLocaleDateString()}
              </span>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
