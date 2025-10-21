
'use client';

import { useTranslation as useTranslationOriginal } from 'react-i18next';
import { useEffect } from 'react';
import i18n from './client';

export function useTranslation(ns?: string) {
  const { t, i18n: instance } = useTranslationOriginal(ns);
  
  useEffect(() => {
    // Sync with cookie on mount
    if (typeof window !== 'undefined') {
      const cookie = document.cookie.split('; ').find(row => row.startsWith('NEXT_LOCALE='));
      const locale = cookie?.split('=')[1] || 'es';
      if (instance.language !== locale) {
        instance.changeLanguage(locale);
      }
    }
  }, [instance]);
  
  return { t, i18n: instance };
}

export function changeLanguage(locale: string) {
  i18n.changeLanguage(locale);
  document.cookie = `NEXT_LOCALE=${locale}; path=/; max-age=31536000; SameSite=Lax`;
}
