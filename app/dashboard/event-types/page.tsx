import { EventTypesList } from '@/components/dashboard/event-types/event-types-list';
import { EventTypesHeader } from '@/components/dashboard/event-types/event-types-header';

export const metadata = {
  title: 'Event Types - ANYTIMEBOT',
  description: 'Manage your event types',
};

export default function EventTypesPage() {
  return (
    <div className="space-y-6">
      <EventTypesHeader />
      <EventTypesList />
    </div>
  );
}
