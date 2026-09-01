import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { EventTypesList } from '@/components/dashboard/event-types/event-types-list';
import { EventTypesHeader } from '@/components/dashboard/event-types/event-types-header';

export const metadata = {
  title: 'Tipos de eventos - ANYTIMEBOT',
  description: 'Gestiona tus tipos de eventos',
};

export default async function EventTypesPage() {
  let userCurrency = 'eur';

  try {
    const session = await getServerSession(authOptions);
    if (session?.user) {
      const user = await prisma.user.findUnique({
        where: { id: (session.user as any).id },
        select: { currency: true },
      });
      if (user?.currency) userCurrency = user.currency;
    }
  } catch (error) {
    // Fall back to default currency
    console.error('Error fetching user currency:', error);
  }

  return (
    <div className="space-y-6">
      <EventTypesHeader currency={userCurrency} />
      <EventTypesList />
    </div>
  );
}