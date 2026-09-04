import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { authenticateApiKey } from '@/lib/api-auth';

export const dynamic = 'force-dynamic';

// GET /api/v1/event-types - list bookable event types (external platforms
// pick which ones they want to sync with)
export async function GET(request: NextRequest) {
  const auth = await authenticateApiKey(request);
  if (!auth) {
    return NextResponse.json(
      { success: false, error: 'unauthorized', message: 'Invalid or missing API key' },
      { status: 401 }
    );
  }

  const { searchParams } = new URL(request.url);
  const bookingPageId = searchParams.get('booking_page_id');

  const where: any = { bookingPage: { userId: auth.userId } };
  if (bookingPageId) where.bookingPageId = bookingPageId;

  const eventTypes = await prisma.eventType.findMany({
    where,
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      bookingPageId: true,
      name: true,
      duration: true,
      bufferTime: true,
      location: true,
      videoLink: true,
      color: true,
      price: true,
      currency: true,
      collectPayment: true,
      paymentInterval: true,
      requiresConfirmation: true,
      bookingPage: { select: { id: true, title: true, slug: true, isActive: true } },
    },
  });

  return NextResponse.json({
    success: true,
    data: eventTypes.map((et) => ({
      id: et.id,
      name: et.name,
      description: null,
      duration_minutes: et.duration,
      buffer_minutes: et.bufferTime,
      location: et.location,
      video_link: et.videoLink,
      color: et.color,
      requires_confirmation: et.requiresConfirmation,
      active: et.bookingPage.isActive,
      payment: et.collectPayment
        ? {
            amount_cents: et.price,
            currency: et.currency,
            interval: et.paymentInterval,
          }
        : null,
      booking_page: {
        id: et.bookingPage.id,
        title: et.bookingPage.title,
        slug: et.bookingPage.slug,
        public_url: `/${et.bookingPage.slug}`,
      },
    })),
  });
}
