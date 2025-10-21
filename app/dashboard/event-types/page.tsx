
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { EventTypesList } from '@/components/dashboard/event-types/event-types-list';
import { CreateEventTypeDialog } from '@/components/dashboard/event-types/create-event-type-dialog';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';

export const metadata = {
  title: 'Event Types - ANYTIMEBOT',
  description: 'Manage your event types',
};

export default async function EventTypesPage() {
  const session = await getServerSession(authOptions);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Event Types</h1>
          <p className="text-gray-600 mt-1">
            Create and manage different types of meetings
          </p>
        </div>
        <CreateEventTypeDialog>
          <Button className="bg-indigo-600 hover:bg-indigo-700">
            <Plus className="mr-2 h-4 w-4" />
            Create Event Type
          </Button>
        </CreateEventTypeDialog>
      </div>
      <EventTypesList />
    </div>
  );
}
