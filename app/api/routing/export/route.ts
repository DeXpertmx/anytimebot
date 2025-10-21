
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

// GET /api/routing/export?eventTypeId=xxx - Export routing responses as CSV
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const eventTypeId = searchParams.get('eventTypeId');

    if (!eventTypeId) {
      return NextResponse.json(
        { success: false, error: 'Event type ID is required' },
        { status: 400 }
      );
    }

    // Verify event type belongs to user
    const eventType = await prisma.eventType.findFirst({
      where: {
        id: eventTypeId,
        bookingPage: {
          userId: (session.user as any).id,
        },
      },
      include: {
        routingResponses: {
          include: {
            booking: {
              include: {
                assignedMember: {
                  select: {
                    name: true,
                    email: true,
                  },
                },
              },
            },
          },
          orderBy: {
            createdAt: 'desc',
          },
        },
      },
    });

    if (!eventType) {
      return NextResponse.json(
        { success: false, error: 'Event type not found' },
        { status: 404 }
      );
    }

    const formSchema: any = eventType.formSchema || { questions: [] };
    const questions = formSchema.questions || [];

    // Build CSV header
    const headers = [
      'Booking ID',
      'Guest Name',
      'Guest Email',
      'Booking Time',
      'Assigned Member',
      ...questions.map((q: any) => q.text),
      'Submitted At',
    ];

    // Build CSV rows
    const rows = eventType.routingResponses.map((response) => {
      const responses: Record<string, any> = response.responses as any;
      return [
        response.bookingId,
        response.booking.guestName,
        response.booking.guestEmail,
        new Date(response.booking.startTime).toLocaleString(),
        response.booking.assignedMember?.name || response.booking.assignedMember?.email || 'Unassigned',
        ...questions.map((q: any) => {
          const answer = responses[q.id];
          return Array.isArray(answer) ? answer.join('; ') : String(answer || '');
        }),
        new Date(response.createdAt).toLocaleString(),
      ];
    });

    // Convert to CSV
    const csvContent = [
      headers.join(','),
      ...rows.map((row) =>
        row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')
      ),
    ].join('\n');

    return new NextResponse(csvContent, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="routing-responses-${eventTypeId}.csv"`,
      },
    });
  } catch (error) {
    console.error('Error exporting routing responses:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
