import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

// GET /api/customers/[id]/feedback - all feedback left by this customer
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const userId = (session.user as any).id;
    const customer = await prisma.customer.findUnique({
      where: { id: params.id },
      select: { userId: true, email: true },
    });
    if (!customer || customer.userId !== userId) {
      return NextResponse.json({ success: false, error: 'Customer not found' }, { status: 404 });
    }

    const feedbacks = await prisma.feedback.findMany({
      where: {
        booking: {
          eventType: { bookingPage: { userId } },
          guestEmail: customer.email,
        },
      },
      orderBy: { createdAt: 'desc' },
      include: {
        booking: {
          select: {
            startTime: true,
            eventType: { select: { name: true } },
          },
        },
      },
    });

    const total = feedbacks.length;
    const average =
      total > 0 ? feedbacks.reduce((sum, f) => sum + f.rating, 0) / total : 0;

    return NextResponse.json({
      success: true,
      data: {
        summary: { total, average: Math.round(average * 10) / 10 },
        feedbacks: feedbacks.map((f) => ({
          id: f.id,
          rating: f.rating,
          comment: f.comment,
          createdAt: f.createdAt,
          eventTypeName: f.booking.eventType.name,
          startTime: f.booking.startTime,
        })),
      },
    });
  } catch (error) {
    console.error('Error fetching customer feedback:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
