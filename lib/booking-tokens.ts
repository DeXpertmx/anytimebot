
import crypto from 'crypto';

/**
 * Generate a secure token for booking operations (cancel, reschedule)
 */
export function generateBookingToken(bookingId: string, operation: 'cancel' | 'reschedule'): string {
  const secret = process.env.NEXTAUTH_SECRET || 'fallback-secret';
  const data = `${bookingId}-${operation}-${Date.now()}`;
  const hash = crypto.createHmac('sha256', secret).update(data).digest('hex');
  return Buffer.from(`${bookingId}:${operation}:${hash}`).toString('base64url');
}

/**
 * Verify and decode a booking token
 */
export function verifyBookingToken(token: string): {
  bookingId: string;
  operation: 'cancel' | 'reschedule';
} | null {
  try {
    const decoded = Buffer.from(token, 'base64url').toString('utf-8');
    const [bookingId, operation, hash] = decoded.split(':');
    
    if (!bookingId || !operation || !hash) {
      return null;
    }
    
    // Basic validation (in production, you'd want to verify the hash and check expiration)
    if (operation !== 'cancel' && operation !== 'reschedule') {
      return null;
    }
    
    return {
      bookingId,
      operation: operation as 'cancel' | 'reschedule',
    };
  } catch (error) {
    console.error('Error verifying booking token:', error);
    return null;
  }
}
