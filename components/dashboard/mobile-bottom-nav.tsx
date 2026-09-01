'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BarChart3, CalendarDays, FileText, UsersRound, Menu } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslation } from '@/lib/i18n/hooks';

const items = [
  { key: 'overview', href: '/dashboard', icon: BarChart3 },
  { key: 'calendar', href: '/dashboard/calendar', icon: CalendarDays },
  { key: 'bookings', href: '/dashboard/bookings', icon: FileText },
  { key: 'customers', href: '/dashboard/customers', icon: UsersRound },
] as const;

export function MobileBottomNav() {
  const pathname = usePathname();
  const { t } = useTranslation();

  const openMenu = () => {
    window.dispatchEvent(new Event('dashboard:open-menu'));
  };

  return (
    <nav
      aria-label="Navegación principal móvil"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white/95 px-1 pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_12px_rgba(15,23,42,0.08)] backdrop-blur md:hidden"
    >
      <div className="mx-auto flex h-16 max-w-md items-stretch justify-around">
        {items.map(({ key, href, icon: Icon }) => {
          const active = pathname === href || (href !== '/dashboard' && pathname?.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex min-w-0 flex-1 flex-col items-center justify-center gap-1 px-1 text-[11px] font-medium transition-colors',
                active ? 'text-indigo-600' : 'text-gray-500 hover:text-gray-900'
              )}
            >
              <Icon className={cn('h-5 w-5', active && 'stroke-[2.5]')} />
              <span className="max-w-full truncate">
                {t(`dashboard.${key}`)}
              </span>
            </Link>
          );
        })}
        <button
          type="button"
          onClick={openMenu}
          className="flex min-w-0 flex-1 flex-col items-center justify-center gap-1 px-1 text-[11px] font-medium text-gray-500 transition-colors hover:text-gray-900"
        >
          <Menu className="h-5 w-5" />
          <span>{t('dashboard.more')}</span>
        </button>
      </div>
    </nav>
  );
}