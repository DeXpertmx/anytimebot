
'use client';

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from '@/messages/en.json';
import es from '@/messages/es.json';

if (!i18n.isInitialized) {
  i18n
    .use(initReactI18next)
    .init({
      resources: {
        en: { translation: en },
        es: { translation: es }
      },
      lng: typeof window !== 'undefined' ? document.cookie.split('; ').find(row => row.startsWith('NEXT_LOCALE='))?.split('=')[1] || 'es' : 'es',
      fallbackLng: 'es',
      interpolation: {
        escapeValue: false
      }
    });
}

export default i18n;
