'use client';

import { useSession } from 'next-auth/react';
import { useTranslation } from '@/lib/i18n/hooks';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Copy } from 'lucide-react';

interface ShareEmbedDialogProps {
  page: { slug: string } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ShareEmbedDialog({ page, open, onOpenChange }: ShareEmbedDialogProps) {
  const { data: session } = useSession();
  const { t } = useTranslation();
  const { toast } = useToast();

  const username = (session?.user as any)?.username || '';

  const publicUrl = page && username ? `${window.location.origin}/${username}/${page.slug}` : '';
  const profileUrl = username ? `${window.location.origin}/${username}` : '';

  const inlineSnippet = page && username
    ? `<div data-anytimebot="${username}/${page.slug}" data-height="680"></div>\n<script src="${window.location.origin}/widget.js" async></script>`
    : '';

  const buttonSnippet = page && username
    ? `<div data-anytimebot="${username}/${page.slug}" data-mode="button" data-label="${t('bookingPages.widgetButtonDefaultLabel')}"></div>\n<script src="${window.location.origin}/widget.js" async></script>`
    : '';

  const copy = (text: string, message: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: t('bookingPages.copied'), description: message });
  };

  if (!page) return null;

  const rows: Array<{ label: string; value: string; hint?: string; message: string }> = [
    { label: t('bookingPages.publicLink'), value: publicUrl, message: t('bookingPages.urlCopied') },
    { label: t('bookingPages.profileLink'), value: profileUrl, message: t('bookingPages.urlCopied') },
    {
      label: t('bookingPages.widgetInline'),
      value: inlineSnippet,
      hint: t('bookingPages.widgetInlineHint'),
      message: t('bookingPages.snippetCopied'),
    },
    {
      label: t('bookingPages.widgetButton'),
      value: buttonSnippet,
      hint: t('bookingPages.widgetButtonHint'),
      message: t('bookingPages.snippetCopied'),
    },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[640px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('bookingPages.shareTitle')}</DialogTitle>
          <DialogDescription>{t('bookingPages.shareDesc')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {rows.map((row) => (
            <div key={row.label} className="space-y-1.5">
              <label className="text-sm font-medium text-gray-900">{row.label}</label>
              <div className="flex items-center gap-2">
                <Input
                  readOnly
                  value={row.value}
                  className="font-mono text-xs text-gray-700"
                  onFocus={(e) => e.currentTarget.select()}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  onClick={() => row.value && copy(row.value, row.message)}
                >
                  <Copy className="mr-1 h-4 w-4" />
                  {t('bookingPages.copy')}
                </Button>
              </div>
              {row.hint && <p className="text-xs text-gray-500">{row.hint}</p>}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
