'use client';

import { useTheme } from 'next-themes';
import { Moon, Sun, Monitor } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useTranslation } from '@/lib/i18n/hooks';

export function ThemeToggle() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const { i18n } = useTranslation();

  const isDark = resolvedTheme === 'dark';

  const options = [
    { value: 'light', label: i18n.t('common.themeLight'), icon: Sun },
    { value: 'dark', label: i18n.t('common.themeDark'), icon: Moon },
    { value: 'system', label: i18n.t('common.themeSystem'), icon: Monitor },
  ];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={i18n.t('common.theme')}>
          {isDark ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {options.map((opt) => (
          <DropdownMenuItem
            key={opt.value}
            onClick={() => setTheme(opt.value)}
            className={theme === opt.value ? 'bg-accent' : ''}
          >
            <opt.icon className="mr-2 h-4 w-4" />
            {opt.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}