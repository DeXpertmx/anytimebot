
'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { cn } from '@/lib/utils';
import {
  Calendar,
  Clock,
  FileText,
  Settings,
  Users,
  BarChart3,
  Globe,
  Bot,
  MessageCircle,
  LineChart,
  CreditCard,
  Shield,
} from 'lucide-react';

export function DashboardSidebar() {
  const pathname = usePathname();
  const { data: session } = useSession() || {};

  // Check if user is admin - DISABLED
  // const isAdmin = (session?.user as any)?.role === 'ADMIN';

  const navigation = [
    {
      name: 'Overview',
      href: '/dashboard',
      icon: BarChart3,
    },
    {
      name: 'Analytics',
      href: '/dashboard/analytics',
      icon: LineChart,
    },
    {
      name: 'Booking Pages',
      href: '/dashboard/booking-pages',
      icon: Globe,
    },
    {
      name: 'Event Types',
      href: '/dashboard/event-types',
      icon: Calendar,
    },
    {
      name: 'Teams',
      href: '/dashboard/teams',
      icon: Users,
    },
    {
      name: 'Bookings',
      href: '/dashboard/bookings',
      icon: FileText,
    },
    {
      name: 'Availability',
      href: '/dashboard/availability',
      icon: Clock,
    },
    {
      name: 'Calendar',
      href: '/dashboard/calendar',
      icon: Calendar,
    },
    {
      name: 'Bot',
      href: '/dashboard/bot',
      icon: Bot,
    },
    {
      name: 'Integraciones',
      href: '/dashboard/integrations',
      icon: MessageCircle,
    },
    {
      name: 'Billing & Plans',
      href: '/pricing',
      icon: CreditCard,
    },
    {
      name: 'Settings',
      href: '/dashboard/settings',
      icon: Settings,
    },
    // Admin panel - DISABLED
    // ...(isAdmin ? [{
    //   name: 'Admin Panel',
    //   href: '/admin',
    //   icon: Shield,
    // }] : []),
  ];

  return (
    <div className="fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-gray-200">
      <div className="flex h-full flex-col">
        {/* Logo */}
        <div className="flex h-20 shrink-0 items-center justify-center border-b border-gray-200 px-4">
          <Link href="/dashboard" className="flex items-center">
            <div className="relative w-[200px] h-[60px]">
              <Image
                src="/anytimebot-logo.png"
                alt="ANYTIMEBOT"
                fill
                className="object-contain"
                priority
              />
            </div>
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 px-4 py-6">
          {navigation.map((item) => {
            const isActive = pathname === item.href || 
              (item.href !== '/dashboard' && pathname?.startsWith(item.href));
            
            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  'group flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors',
                  isActive
                    ? 'bg-indigo-50 text-indigo-600 border-r-2 border-indigo-600'
                    : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
                )}
              >
                <item.icon
                  className={cn(
                    'mr-3 h-5 w-5 flex-shrink-0',
                    isActive ? 'text-indigo-600' : 'text-gray-400 group-hover:text-gray-500'
                  )}
                />
                {item.name}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
