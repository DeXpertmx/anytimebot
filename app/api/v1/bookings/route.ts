import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { authenticateApiKey } from '@/lib/api-auth';

export const dynamic = 'force-dynamic';

// GET /api/v1/bookings - list bookings for external sync.
// Filters: event_type_id, status, from, to, updated_since, page, limit
export async function GET(request: NextRequest) {
  const auth = await authenticateApiKey(request);
  if (!auth) {
    return NextResponse.json(
      { success: false, error: 'unauthorized', message: 'Invalid or missing API key' },
      { status: 401 }
    );
  }

  const { searchParams } = new URL(request.url);

  const eventTypeId = searchParams.get('event_type_id');
  const status = searchParams.get('status');
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  const updatedSince = searchParams.get('updated_since');
  const page = Math.max(parseInt(searchParams.get('page') || '1'), 1);
  const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '50'), 1), 100);

  const where: any = { eventType: { bookingPage: { userId: auth.userId } } };
  if (eventTypeId) where.eventTypeId = eventTypeId;
  if (status) {
    const statuses = status.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
    if (statuses.length) where.status = { in: statuses };
  }
  if (from || to) {
    where.startTime = {};
    if (from) {
      const d = new Date(from);
      if (Number.isNaN(d.getTime())) {
        return NextResponse.json(
          { success: false, error: 'bad_request', message: 'Invalid `from` date' },
          { status: 400 }
        );
      }
      where.startTime.gte = d;
    }
    if (to) {
      const d = new Date(to);
      if (Number.isNaN(d.getTime())) {
        return NextResponse.json(
          { success: false, error: 'bad_request', message: 'Invalid `to` date' },
          { status: 400 }
        );
      }
      where.startTime.lte = d;
    }
  }
  if (updatedSince) {
    const d = new Date(updatedSince);
    if (Number.isNaN(d.getTime())) {
      return NextResponse.json(
        { success: false, error: 'bad_request', message: 'Invalid `updated_since` date' },
        { status: 400 }
      );
    }
    where.updatedAt = { gte: d };
  }

  const [bookings, total] = await Promise.all([
    prisma.booking.findMany({
      where,
      orderBy: { startTime: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        eventTypeId: true,
        guestName: true,
        guestEmail: true,
        guestPhone: true,
        startTime: true,
        endTime: true,
        timezone: true,
        status: true,
        formData: true,
        notes: true,
        paymentStatus: true,
        paymentAmount: true,
        paymentCurrency: true,
        createdAt: true,
        updatedAt: true,
        eventType: { select: { id: true, name: true, duration: true, location: true, videoLink: true } },
      },
    }),
    prisma.booking.count({ where }),
  ]);

  return NextResponse.json({
    success: true,
    data: bookings.map((b) => ({
      id: b.id,
      event_type: {
        id: b.eventType.id,
        name: b.eventType.name,
        location: b.eventType.location,
        video_link: b.eventType.videoLink,
      },
      guest: {
        name: b.guestName,
        email: b.guestEmail,
        phone: b.guestPhone,
      },
      start_time: b.startTime.toISOString(),
      end_time: b.endTime.toISOString(),
      timezone: b.timezone,
      status: b.status,
      form_data: b.formData,
      notes: b.notes,
      payment: b.paymentStatus
        ? { status: b.paymentStatus, amount_cents: b.paymentAmount, currency: b.paymentCurrency }
        : null,
      created_at: b.createdAt.toISOString(),
      updated_at: b.updatedAt.toISOString(),
    })),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
}
