
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { notFound } from 'next/navigation';
import { EditBookingPageForm } from '@/components/dashboard/booking-pages/edit-booking-page-form';
import { Button } from '@/components/ui/button';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import Link from 'next/link';

interface Props {
  params: { id: string };
}

export default async function EditBookingPagePage({ params }: Props) {
  const session = await getServerSession(authOptions);
  
  if (!session?.user) {
    return null;
  }

  const bookingPage = await prisma.bookingPage.findFirst({
    where: {
      id: params.id,
      userId: (session.user as any).id,
    },
    include: {
      eventTypes: true,
      availability: true,
    },
  });

  if (!bookingPage) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/dashboard/booking-pages">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Link>
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Edit Booking Page</h1>
            <p className="text-gray-600 mt-1">
              Update your booking page settings
            </p>
          </div>
        </div>
        <Button variant="outline" asChild>
          <Link href={`/${bookingPage.slug}`} target="_blank">
            <ExternalLink className="mr-2 h-4 w-4" />
            View Page
          </Link>
        </Button>
      </div>
      <EditBookingPageForm bookingPage={{
        ...bookingPage,
        description: bookingPage.description ?? undefined
      }} />
    </div>
  );
}
