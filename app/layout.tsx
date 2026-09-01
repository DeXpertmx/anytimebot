
import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Providers } from '@/components/providers';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { I18nProvider } from '@/components/i18n-provider';
import { PWARegister } from '@/components/pwa-register';
import { cookies } from 'next/headers';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'ANYTIMEBOT - Plataforma de Agendamiento Inteligente',
  description: 'Agenda reuniones y citas con facilidad usando ANYTIMEBOT - la plataforma de scheduling de próxima generación con IA y WhatsApp.',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: '/Anytimebot-icon.png',
    shortcut: '/Anytimebot-icon.png',
    apple: '/apple-touch-icon.png',
    other: [
      {
        rel: 'apple-touch-icon-precomposed',
        url: '/apple-touch-icon.png',
      },
    ],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Anytimebot',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#4f46e5',
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);
  const cookieStore = await cookies();
  const localeCookie = cookieStore.get('NEXT_LOCALE');
  const locale = localeCookie?.value || 'es';

  return (
    <html lang={locale}>
      <body className={inter.className}>
        <I18nProvider locale={locale}>
          <Providers session={session}>
            <PWARegister />
            {children}
          </Providers>
        </I18nProvider>
      </body>
    </html>
  );
}
