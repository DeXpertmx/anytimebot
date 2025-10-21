
import { NextRequest, NextResponse } from 'next/server';
import { verifyBookingToken } from '@/lib/booking-tokens';

export const dynamic = 'force-dynamic';

// POST /api/bookings/verify-token - Verify a booking token
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { token } = body;

    if (!token) {
      return NextResponse.json(
        { success: false, error: 'Token is required' },
        { status: 400 }
      );
    }

    const verified = verifyBookingToken(token);

    if (!verified) {
      return NextResponse.json(
        { success: false, error: 'Invalid or expired token' },
        { status: 401 }
      );
    }

    return NextResponse.json({
      success: true,
      bookingId: verified.bookingId,
      operation: verified.operation,
    });
  } catch (error) {
    console.error('Error verifying token:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
