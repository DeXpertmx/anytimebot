
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { notFound } from 'next/navigation';
import { EditEventTypeForm } from '@/components/dashboard/event-types/edit-event-type-form';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';

interface Props {
  params: { id: string };
}

export default async function EditEventTypePage({ params }: Props) {
  const session = await getServerSession(authOptions);
  
  if (!session?.user) {
    return null;
  }

  // Get event type with booking page
  const eventType = await prisma.eventType.findFirst({
    where: {
      id: params.id,
      bookingPage: {
        userId: (session.user as any).id,
      },
    },
    include: {
      bookingPage: true,
      formFields: true,
    },
  });

  if (!eventType) {
    notFound();
  }

  // Get all booking pages for this user (to allow changing the booking page)
  const bookingPages = await prisma.bookingPage.findMany({
    where: {
      userId: (session.user as any).id,
    },
    select: {
      id: true,
      title: true,
      slug: true,
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/dashboard/event-types">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Edit Event Type</h1>
          <p className="text-gray-600 mt-1">
            Update your event type settings
          </p>
        </div>
      </div>
      <EditEventTypeForm eventType={eventType} bookingPages={bookingPages} />
    </div>
  );
}
