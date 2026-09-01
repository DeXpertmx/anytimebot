import webpush from 'web-push';
import { prisma } from '@/lib/db';
import { getPublicAppUrl } from '@/lib/public-url';

interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

function isConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY &&
    process.env.VAPID_PRIVATE_KEY &&
    process.env.VAPID_SUBJECT
  );
}

function configure() {
  if (!isConfigured()) return false;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT!,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  );
  return true;
}

/** Best-effort notification; missing VAPID config never breaks a booking. */
export async function notifyUser(userId: string, payload: PushPayload): Promise<number> {
  if (!configure()) return 0;

  const subscriptions = await prisma.pushSubscription.findMany({
    where: { userId },
    select: { id: true, endpoint: true, p256dh: true, auth: true },
  });

  const results = await Promise.allSettled(
    subscriptions.map(async (subscription) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth },
          },
          JSON.stringify(payload),
          { TTL: 86400 },
        );
        return true;
      } catch (error: any) {
        // Browsers return 404/410 when a device subscription has expired.
        if (error?.statusCode === 404 || error?.statusCode === 410) {
          await prisma.pushSubscription.delete({ where: { id: subscription.id } }).catch(() => undefined);
        } else {
          console.error('Web Push delivery failed:', error?.message || error);
        }
        return false;
      }
    }),
  );

  return results.filter((result) => result.status === 'fulfilled' && result.value).length;
}

export async function notifyBookingCreated(userId: string, guestName: string, eventName: string, bookingId: string) {
  await notifyUser(userId, {
    title: 'Nueva reserva',
    body: `${guestName} ha reservado ${eventName}`,
    url: `${getPublicAppUrl()}/dashboard/bookings/${bookingId}`,
    tag: `booking-created-${bookingId}`,
  }).catch((error) => console.error('Push booking notification failed:', error));
}

export async function notifyBookingCancelled(userId: string, guestName: string, eventName: string, bookingId: string) {
  await notifyUser(userId, {
    title: 'Reserva cancelada',
    body: `${guestName} ha cancelado ${eventName}`,
    url: `${getPublicAppUrl()}/dashboard/bookings/${bookingId}`,
    tag: `booking-cancelled-${bookingId}`,
  }).catch((error) => console.error('Push cancellation notification failed:', error));
}