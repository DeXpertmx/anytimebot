
'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useTranslation } from '@/lib/i18n/hooks';
import { cn } from '@/lib/utils';
import { PwaInstallButton } from '@/components/pwa-install-button';
import {
  Calendar,
  Clock,
  FileText,
  Settings,
  Users,
  UsersRound,
  BarChart3,
  Globe,
  Bot,
  MessageCircle,
  LifeBuoy,
  LineChart,
  CreditCard,
  Shield,
  MessageSquareQuote,
  Wallet,
  BadgeCheck,
} from 'lucide-react';

export function DashboardSidebar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const openMenu = () => setMobileOpen(true);
    window.addEventListener('dashboard:open-menu', openMenu);
    return () => window.removeEventListener('dashboard:open-menu', openMenu);
  }, []);
  const { data: session } = useSession() || {};
  const { t } = useTranslation();

  // Check if user is admin - DISABLED
  // const isAdmin = (session?.user as any)?.role === 'ADMIN';

  const navigation = [
    {
      name: t('dashboard.overview'),
      href: '/dashboard',
      icon: BarChart3,
    },
    {
      name: t('dashboard.analytics'),
      href: '/dashboard/analytics',
      icon: LineChart,
    },
    {
      name: t('dashboard.bookingPages'),
      href: '/dashboard/booking-pages',
      icon: Globe,
    },
    {
      name: t('dashboard.eventTypes'),
      href: '/dashboard/event-types',
      icon: Calendar,
    },
    {
      name: t('dashboard.teams'),
      href: '/dashboard/teams',
      icon: Users,
    },
    {
      name: t('dashboard.bookings'),
      href: '/dashboard/bookings',
      icon: FileText,
    },
    {
      name: t('dashboard.customers'),
      href: '/dashboard/customers',
      icon: UsersRound,
    },
    {
      name: t('dashboard.feedback'),
      href: '/dashboard/feedback',
      icon: MessageSquareQuote,
    },
    {
      name: t('dashboard.revenue'),
      href: '/dashboard/revenue',
      icon: Wallet,
    },
    {
      name: t('dashboard.memberships'),
      href: '/dashboard/memberships',
      icon: BadgeCheck,
    },
    {
      name: t('dashboard.availability'),
      href: '/dashboard/availability',
      icon: Clock,
    },
    {
      name: t('dashboard.calendar'),
      href: '/dashboard/calendar',
      icon: Calendar,
    },
    {
      name: t('dashboard.bot'),
      href: '/dashboard/bot',
      icon: Bot,
    },
    {
      name: t('dashboard.integrations'),
      href: '/dashboard/integrations',
      icon: MessageCircle,
    },
    {
      name: t('dashboard.billingPlans'),
      href: '/pricing',
      icon: CreditCard,
    },
    {
      name: t('dashboard.support'),
      href: '/dashboard/support',
      icon: LifeBuoy,
    },
    {
      name: t('dashboard.api'),
      href: '/dashboard/api',
      icon: Shield,
    },
    {
      name: t('dashboard.settings'),
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
    <>
      {mobileOpen && (
        <button
          type="button"
          aria-label="Cerrar menú"
          className="fixed inset-0 z-40 bg-black/30 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <div className={cn(
        'fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-gray-200 transition-transform md:translate-x-0',
        mobileOpen ? 'translate-x-0' : '-translate-x-full md:block',
      )}>
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

        {/* PWA install button (only when the browser offers installation) */}
        <div className="shrink-0 px-4 pb-4">
          <PwaInstallButton />
        </div>
      </div>
      </div>
    </>
  );
}
