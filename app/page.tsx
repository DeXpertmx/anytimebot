
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { LandingPageContent } from '@/components/landing-page-content';
import { headers } from 'next/headers';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'ANYTIMEBOT - Plataforma de Scheduling con IA y WhatsApp | Agenda Inteligente',
  description: 'La plataforma de agendamiento más avanzada con IA personalizable, WhatsApp Bot nativo, Smart Video Rooms, Pre-Meeting Intelligence Briefs y Team Scheduling. Automatiza tus citas y aumenta tu productividad.',
  keywords: 'scheduling, agendamiento, calendario, whatsapp bot, AI assistant, video meetings, team scheduling, booking automation, smart calendar, meeting intelligence',
  openGraph: {
    title: 'ANYTIMEBOT - Scheduling Inteligente con IA',
    description: 'Automatiza tus citas con WhatsApp, gestiona equipos y obtén insights de reuniones con IA',
    url: 'https://anytimebot.app',
    siteName: 'ANYTIMEBOT',
    locale: 'es_ES',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'ANYTIMEBOT - Scheduling con IA',
    description: 'La plataforma más completa para agendamiento inteligente',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
};

export default async function HomePage() {
  const headersList = await headers();
  const userAgent = headersList.get('user-agent') || '';
  
  // Allow all crawlers/bots to see the landing page without redirection
  const isCrawler = /bot|crawler|spider|crawling|google|bing|yahoo|duckduckbot|baiduspider|yandex|facebookexternalhit|twitterbot|rogerbot|linkedinbot|embedly|quora link preview|showyoubot|outbrain|pinterest|slackbot|vkShare|W3C_Validator/i.test(userAgent);
  
  if (!isCrawler) {
    const session = await getServerSession(authOptions);
    if (session) {
      redirect('/dashboard');
    }
  }

  return <LandingPageContent />;
}
