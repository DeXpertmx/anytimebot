
import { prisma as db } from './db';
import { PLANS } from './stripe';

/**
 * Check if user can create a new booking based on their plan
 */
export async function canUserBook(userId: string): Promise<{ allowed: boolean; reason?: string }> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      plan: true,
      bookingsThisMonth: true,
      lastBookingReset: true,
    },
  });

  if (!user) {
    return { allowed: false, reason: 'User not found' };
  }

  // Reset monthly counter if needed
  const now = new Date();
  const lastReset = user.lastBookingReset || new Date(0);
  const monthsSinceReset =
    (now.getFullYear() - lastReset.getFullYear()) * 12 +
    (now.getMonth() - lastReset.getMonth());

  if (monthsSinceReset >= 1) {
    // Reset counter
    await db.user.update({
      where: { id: userId },
      data: {
        bookingsThisMonth: 0,
        lastBookingReset: now,
      },
    });
    return { allowed: true };
  }

  // Check limits based on plan
  if (user.plan === 'FREE') {
    const limit = PLANS.FREE.bookingsPerMonth;
    if (user.bookingsThisMonth >= limit) {
      return {
        allowed: false,
        reason: `You've reached your monthly limit of ${limit} bookings. Upgrade to Premium for unlimited bookings.`,
      };
    }
  }

  // Premium users have unlimited bookings
  return { allowed: true };
}

/**
 * Increment user's booking count
 */
export async function incrementBookingCount(userId: string): Promise<void> {
  await db.user.update({
    where: { id: userId },
    data: {
      bookingsThisMonth: {
        increment: 1,
      },
    },
  });
}
