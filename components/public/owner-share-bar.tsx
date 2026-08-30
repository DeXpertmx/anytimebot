'use client';

import { useState } from 'react';
import { useTranslation } from '@/lib/i18n/hooks';
import { useToast } from '@/hooks/use-toast';
import { ShareEmbedDialog } from '@/components/dashboard/booking-pages/share-embed-dialog';
import { Button } from '@/components/ui/button';
import { Copy, Share2 } from 'lucide-react';

interface OwnerShareBarProps {
  username: string;
  slug: string;
}

/**
 * Floating bar shown on the public booking page when the logged-in user
 * is the page owner (Calendly-style): quick copy link + share & embed.
 */
export function OwnerShareBar({ username, slug }: OwnerShareBarProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [shareOpen, setShareOpen] = useState(false);

  const copyLink = () => {
    const url = `${window.location.origin}/${username}/${slug}`;
    navigator.clipboard.writeText(url);
    toast({
      title: t('bookingPages.copied'),
      description: t('bookingPages.urlCopied'),
    });
  };

  return (
    <>
      <div className="fixed bottom-0 inset-x-0 z-40 bg-white/90 backdrop-blur border-t border-gray-200">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <p className="text-sm text-gray-700 truncate hidden sm:block">
            {t('bookingPages.ownerBar')}
          </p>
          <div className="flex gap-2 shrink-0 ml-auto">
            <Button variant="outline" size="sm" onClick={copyLink}>
              <Copy className="mr-1 h-4 w-4" />
              {t('bookingPages.copyLink')}
            </Button>
            <Button
              size="sm"
              className="bg-indigo-600 hover:bg-indigo-700"
              onClick={() => setShareOpen(true)}
            >
              <Share2 className="mr-1 h-4 w-4" />
              {t('bookingPages.shareTitle')}
            </Button>
          </div>
        </div>
      </div>
      <ShareEmbedDialog
        page={{ slug }}
        open={shareOpen}
        onOpenChange={(open) => setShareOpen(open)}
      />
    </>
  );
}
