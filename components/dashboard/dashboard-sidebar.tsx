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
  CalendarDays,
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
  Shield,
  MessageSquareQuote,
  Wallet,
  BadgeCheck,
  Store,
} from 'lucide-react';

interface NavItem {
  nameKey: string;
  href: string;
  icon: typeof BarChart3;
}

interface NavGroup {
  /** i18n key under dashboard.groups */
  labelKey: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    labelKey: 'general',
    items: [
      { nameKey: 'overview', href: '/dashboard', icon: BarChart3 },
      { nameKey: 'analytics', href: '/dashboard/analytics', icon: LineChart },
    ],
  },
  {
    labelKey: 'planning',
    items: [
      { nameKey: 'calendar', href: '/dashboard/calendar', icon: CalendarDays },
      { nameKey: 'bookings', href: '/dashboard/bookings', icon: FileText },
    ],
  },
  {
    labelKey: 'bookingSetup',
    items: [
      { nameKey: 'bookingPages', href: '/dashboard/booking-pages', icon: Globe },
      { nameKey: 'eventTypes', href: '/dashboard/event-types', icon: Calendar },
    ],
  },
  {
    labelKey: 'clients',
    items: [
      { nameKey: 'customers', href: '/dashboard/customers', icon: UsersRound },
      { nameKey: 'teams', href: '/dashboard/teams', icon: Users },
      { nameKey: 'feedback', href: '/dashboard/feedback', icon: MessageSquareQuote },
    ],
  },
  {
    labelKey: 'communication',
    items: [
      { nameKey: 'bot', href: '/dashboard/bot', icon: Bot },
      { nameKey: 'integrations', href: '/dashboard/integrations', icon: MessageCircle },
      { nameKey: 'api', href: '/dashboard/api', icon: Shield },
    ],
  },
  {
    labelKey: 'billing',
    items: [
      { nameKey: 'revenue', href: '/dashboard/revenue', icon: Wallet },
      { nameKey: 'memberships', href: '/dashboard/memberships', icon: BadgeCheck },
    ],
  },
  {
    labelKey: 'system',
    items: [
      { nameKey: 'support', href: '/dashboard/support', icon: LifeBuoy },
      { nameKey: 'settings', href: '/dashboard/settings', icon: Settings },
    ],
  },
];

// Extra navigation for reseller accounts (their own pricing panel).
const RESELLER_NAV: NavItem = { nameKey: 'resellerPanel', href: '/dashboard/reseller', icon: Store };

function isActive(pathname: string | null | undefined, href: string): boolean {
  if (!pathname) return false;
  if (href === '/dashboard') return pathname === '/dashboard';
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function DashboardSidebar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { data: session } = useSession();
  const isReseller = !!(session?.user as any)?.isReseller;

  useEffect(() => {
    const openMenu = () => setMobileOpen(true);
    window.addEventListener('dashboard:open-menu', openMenu);
    return () => window.removeEventListener('dashboard:open-menu', openMenu);
  }, []);
  const { t } = useTranslation();

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

        {/* Grouped navigation — scrolls on its own when the viewport is
            shorter than the list (tablets in landscape, small laptops). */}
        <nav className="flex-1 min-h-0 overflow-y-auto overscroll-contain scrollbar-slim px-4 py-4">
          {NAV_GROUPS.map((group, groupIndex) => (
            <div
              key={group.labelKey}
              className={cn('space-y-1', groupIndex > 0 && 'mt-5 border-t border-gray-100 pt-4')}
            >
              <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-gray-400 select-none">
                {t(`dashboard.groups.${group.labelKey}`)}
              </p>
              {isReseller && group.labelKey === 'system' && (
                <Link
                  key={RESELLER_NAV.href}
                  href={RESELLER_NAV.href}
                  className={cn(
                    'group flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors',
                    isActive(pathname, RESELLER_NAV.href)
                      ? 'bg-indigo-50 text-indigo-600 border-r-2 border-indigo-600'
                      : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
                  )}
                >
                  <RESELLER_NAV.icon
                    className={cn(
                      'mr-3 h-5 w-5 flex-shrink-0',
                      isActive(pathname, RESELLER_NAV.href) ? 'text-indigo-600' : 'text-gray-400 group-hover:text-gray-500'
                    )}
                  />
                  {t(`dashboard.${RESELLER_NAV.nameKey}`)}
                </Link>
              )}
              {group.items.map((item) => {
                const active = isActive(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      'group flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors',
                      active
                        ? 'bg-indigo-50 text-indigo-600 border-r-2 border-indigo-600'
                        : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
                    )}
                  >
                    <item.icon
                      className={cn(
                        'mr-3 h-5 w-5 flex-shrink-0',
                        active ? 'text-indigo-600' : 'text-gray-400 group-hover:text-gray-500'
                      )}
                    />
                    {t(`dashboard.${item.nameKey}`)}
                  </Link>
                );
              })}
            </div>
          ))}
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
