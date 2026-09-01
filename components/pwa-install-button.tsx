'use client';

import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { useTranslation } from '@/lib/i18n/hooks';
import { cn } from '@/lib/utils';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/**
 * PWA install button. Shows only when the browser fires `beforeinstallprompt`
 * (i.e. the site is installable and not already installed). Everything else
 * (unsupported browser, iOS, already installed) renders nothing.
 */
export function PwaInstallButton({ className }: { className?: string }) {
  const { t } = useTranslation();
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [standalone, setStandalone] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Already running as an installed app? Hide the button.
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    setStandalone(isStandalone);

    const onBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const onAppInstalled = () => {
      setInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onAppInstalled);
    // iOS: track "Add to Home Screen" through blur/focus heuristics is unreliable,
    // so rely on standalone detection at mount and appinstalled on Chrome.

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    if (choice.outcome === 'accepted') {
      setInstalled(true);
    }
    setDeferredPrompt(null);
  };

  if (!deferredPrompt || standalone || installed) return null;

  return (
    <button
      type="button"
      onClick={handleInstall}
      className={cn(
        'group flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors',
        'text-indigo-600 bg-indigo-50 hover:bg-indigo-100 w-full',
        className
      )}
    >
      <Download className="mr-3 h-5 w-5 flex-shrink-0" />
      {t('dashboard.installApp')}
    </button>
  );
}