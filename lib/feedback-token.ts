import crypto from 'crypto';

// HMAC token so only the emailed link can submit feedback for a booking
export function feedbackToken(bookingId: string): string {
  const secret = process.env.NEXTAUTH_SECRET || 'anytimebot-dev-secret';
  return crypto.createHmac('sha256', secret).update(`feedback:${bookingId}`).digest('hex').slice(0, 32);
}
