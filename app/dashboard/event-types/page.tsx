import { EventTypesList } from '@/components/dashboard/event-types/event-types-list';
import { EventTypesHeader } from '@/components/dashboard/event-types/event-types-header';

export const metadata = {
  title: 'Tipos de eventos - ANYTIMEBOT',
  description: 'Gestiona tus tipos de eventos',
};

export default function EventTypesPage() {
  return (
    <div className="space-y-6">
      <EventTypesHeader />
      <EventTypesList />
    </div>
  );
}
