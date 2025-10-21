
'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Calendar,
  Clock,
  Users,
  Globe,
  Plus,
  ArrowRight,
  TrendingUp,
} from 'lucide-react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';

interface DashboardStats {
  bookingPages: number;
  eventTypes: number;
  totalBookings: number;
  upcomingBookings: number;
  recentBookings: any[];
}

export function DashboardOverview() {
  const { data: session } = useSession();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      if (!session?.user) return;

      try {
        const [bookingPagesRes, eventTypesRes, bookingsRes] = await Promise.all([
          fetch('/api/booking-pages'),
          fetch('/api/event-types'),
          fetch('/api/bookings?limit=5'),
        ]);

        const [bookingPagesData, eventTypesData, bookingsData] = await Promise.all([
          bookingPagesRes.json(),
          eventTypesRes.json(),
          bookingsRes.json(),
        ]);

        if (bookingPagesData?.success && eventTypesData?.success && bookingsData?.success) {
          const now = new Date();
          const upcomingBookings = bookingsData.data?.bookings?.filter((booking: any) =>
            new Date(booking.startTime) > now && booking.status === 'CONFIRMED'
          ) || [];

          setStats({
            bookingPages: bookingPagesData.data?.length || 0,
            eventTypes: eventTypesData.data?.length || 0,
            totalBookings: bookingsData.data?.pagination?.total || 0,
            upcomingBookings: upcomingBookings.length,
            recentBookings: bookingsData.data?.bookings?.slice(0, 3) || [],
          });
        }
      } catch (error) {
        console.error('Error fetching dashboard stats:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, [session]);

  if (loading) {
    return (
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="p-6">
              <div className="h-4 bg-gray-200 rounded w-1/2 mb-2"></div>
              <div className="h-8 bg-gray-200 rounded w-1/3"></div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const statsCards = [
    {
      title: 'Booking Pages',
      value: stats?.bookingPages || 0,
      icon: Globe,
      color: 'text-indigo-600',
      bgColor: 'bg-indigo-50',
      href: '/dashboard/booking-pages',
    },
    {
      title: 'Event Types',
      value: stats?.eventTypes || 0,
      icon: Calendar,
      color: 'text-green-600',
      bgColor: 'bg-green-50',
      href: '/dashboard/event-types',
    },
    {
      title: 'Total Bookings',
      value: stats?.totalBookings || 0,
      icon: Users,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
      href: '/dashboard/bookings',
    },
    {
      title: 'Upcoming',
      value: stats?.upcomingBookings || 0,
      icon: Clock,
      color: 'text-orange-600',
      bgColor: 'bg-orange-50',
      href: '/dashboard/bookings?status=confirmed',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {statsCards.map((stat) => (
          <Link key={stat.title} href={stat.href}>
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">{stat.title}</p>
                    <p className="text-3xl font-bold text-gray-900">{stat.value}</p>
                  </div>
                  <div className={`p-3 rounded-full ${stat.bgColor}`}>
                    <stat.icon className={`h-6 w-6 ${stat.color}`} />
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <TrendingUp className="mr-2 h-5 w-5 text-indigo-600" />
              Quick Actions
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button asChild className="w-full justify-start" variant="outline">
              <Link href="/dashboard/booking-pages">
                <Plus className="mr-2 h-4 w-4" />
                Create Booking Page
              </Link>
            </Button>
            <Button asChild className="w-full justify-start" variant="outline">
              <Link href="/dashboard/event-types">
                <Plus className="mr-2 h-4 w-4" />
                Add Event Type
              </Link>
            </Button>
            <Button asChild className="w-full justify-start" variant="outline">
              <Link href="/dashboard/availability">
                <Clock className="mr-2 h-4 w-4" />
                Set Availability
              </Link>
            </Button>
          </CardContent>
        </Card>

        {/* Recent Bookings */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Recent Bookings</CardTitle>
            <Button asChild variant="ghost" size="sm">
              <Link href="/dashboard/bookings">
                View all
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {stats?.recentBookings?.length ? (
              <div className="space-y-4">
                {stats.recentBookings.map((booking: any) => (
                  <div key={booking.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center">
                        <Users className="h-5 w-5 text-indigo-600" />
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{booking.guestName}</p>
                        <p className="text-sm text-gray-500">{booking.eventType?.name}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium text-gray-900">
                        {new Date(booking.startTime).toLocaleDateString()}
                      </p>
                      <Badge
                        variant={
                          booking.status === 'CONFIRMED'
                            ? 'default'
                            : booking.status === 'PENDING'
                            ? 'secondary'
                            : 'destructive'
                        }
                      >
                        {booking.status}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-6 text-gray-500">
                <Users className="mx-auto h-12 w-12 text-gray-300 mb-4" />
                <p>No bookings yet</p>
                <p className="text-sm">Create a booking page to get started</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
