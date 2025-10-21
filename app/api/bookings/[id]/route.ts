
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { sendBookingCancellation } from '@/lib/evolution-api';

export const dynamic = 'force-dynamic';

// GET /api/bookings/[id] - Get a specific booking
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const booking = await prisma.booking.findFirst({
      where: {
        id: params.id,
        eventType: {
          bookingPage: {
            userId: (session.user as any).id,
          },
        },
      },
      include: {
        eventType: {
          include: {
            bookingPage: {
              include: {
                user: true,
              },
            },
            formFields: true,
          },
        },
      },
    });

    if (!booking) {
      return NextResponse.json(
        { success: false, error: 'Booking not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: booking,
    });
  } catch (error) {
    console.error('Error fetching booking:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PUT /api/bookings/[id] - Update booking status
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { status } = body;

    if (!status || !['CONFIRMED', 'CANCELLED', 'PENDING'].includes(status)) {
      return NextResponse.json(
        { success: false, error: 'Invalid status' },
        { status: 400 }
      );
    }

    // Check if booking belongs to user
    const existingBooking = await prisma.booking.findFirst({
      where: {
        id: params.id,
        eventType: {
          bookingPage: {
            userId: (session.user as any).id,
          },
        },
      },
    });

    if (!existingBooking) {
      return NextResponse.json(
        { success: false, error: 'Booking not found' },
        { status: 404 }
      );
    }

    const updatedBooking = await prisma.booking.update({
      where: { id: params.id },
      data: { status: status as any },
      include: {
        eventType: {
          include: {
            bookingPage: {
              include: {
                user: true,
              },
            },
          },
        },
      },
    });

    // Send WhatsApp notification if booking is cancelled and user has WhatsApp enabled
    if (status === 'CANCELLED' && updatedBooking.guestPhone) {
      const user = await prisma.user.findUnique({
        where: { id: updatedBooking.eventType.bookingPage.user.id },
        select: {
          id: true,
          whatsappEnabled: true,
          evolutionApiUrl: true,
          evolutionApiKey: true,
          evolutionInstanceName: true,
        },
      });

      if (user?.whatsappEnabled && user.evolutionApiUrl && user.evolutionApiKey && user.evolutionInstanceName) {
        try {
          const credentials = {
            apiUrl: user.evolutionApiUrl,
            apiKey: user.evolutionApiKey,
            instanceName: user.evolutionInstanceName,
          };

          await sendBookingCancellation(credentials, {
            guestName: updatedBooking.guestName,
            guestPhone: updatedBooking.guestPhone,
            eventName: updatedBooking.eventType.name,
            startTime: updatedBooking.startTime,
          });

          // Store the message in database
          await prisma.whatsAppMessage.create({
            data: {
              userId: user.id,
              bookingId: updatedBooking.id,
              phone: updatedBooking.guestPhone,
              message: `Cancelación de reserva para ${updatedBooking.eventType.name}`,
              direction: 'OUTGOING',
              status: 'SENT',
            },
          });
        } catch (whatsappError) {
          console.error('Failed to send WhatsApp cancellation:', whatsappError);
          // Don't fail the update if WhatsApp fails
        }
      }
    }

    return NextResponse.json({
      success: true,
      data: updatedBooking,
    });
  } catch (error) {
    console.error('Error updating booking:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE /api/bookings/[id] - Cancel/Delete a booking
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Check if booking belongs to user
    const existingBooking = await prisma.booking.findFirst({
      where: {
        id: params.id,
        eventType: {
          bookingPage: {
            userId: (session.user as any).id,
          },
        },
      },
    });

    if (!existingBooking) {
      return NextResponse.json(
        { success: false, error: 'Booking not found' },
        { status: 404 }
      );
    }

    // Instead of deleting, we'll mark as cancelled
    const cancelledBooking = await prisma.booking.update({
      where: { id: params.id },
      data: { status: 'CANCELLED' },
    });

    return NextResponse.json({
      success: true,
      data: cancelledBooking,
    });
  } catch (error) {
    console.error('Error cancelling booking:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
