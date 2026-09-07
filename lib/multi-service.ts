/**
 * Multi-service bookings: a guest combines several event types (services) into
 * ONE consecutive block — e.g. "Corte de cabello" (30 min) + "Barba" (20 min)
 * booked together as a single 50-minute appointment.
 *
 * The Booking row keeps `eventTypeId` = the FIRST service (primary) so all the
 * existing queries (calendar, revenue, emails, webhooks) keep working, and a
 * `serviceItems` JSON column stores the full list of combined services.
 */

export interface ServiceItem {
  eventTypeId: string;
  name: string;
  duration: number;
  price: number;
  currency: string;
  collectPayment: boolean;
  paymentInterval?: string | null;
}

interface EventTypeLike {
  id: string;
  name: string;
  duration: number;
  price: number;
  currency: string;
  collectPayment: boolean;
  paymentInterval?: string | null;
  bufferTime: number;
  requiresConfirmation: boolean;
}

/** Build the serviceItems list for a set of selected event types (in order). */
export function buildServiceItems(eventTypes: EventTypeLike[]): ServiceItem[] {
  return eventTypes.map((et) => ({
    eventTypeId: et.id,
    name: et.name,
    duration: et.duration,
    price: et.price,
    currency: et.currency,
    collectPayment: et.collectPayment,
    paymentInterval: et.paymentInterval ?? null,
  }));
}

/** Total duration of a combined booking (sum of every service duration). */
export function totalDuration(eventTypes: EventTypeLike[]): number {
  return eventTypes.reduce((acc, et) => acc + et.duration, 0);
}

/** Combined buffer: the largest buffer so every service keeps its gap. */
export function maxBuffer(eventTypes: EventTypeLike[]): number {
  return eventTypes.reduce((acc, et) => Math.max(acc, et.bufferTime), 0);
}

/** Combined display name: "Corte de cabello + Barba". */
export function combinedName(eventTypes: EventTypeLike[]): string {
  return eventTypes.map((et) => et.name).join(' + ');
}

/** Total payable amount (cents) of the paid services in the block. */
export function totalPrice(eventTypes: EventTypeLike[]): number {
  return eventTypes
    .filter((et) => et.collectPayment)
    .reduce((acc, et) => acc + et.price, 0);
}

/** True when at least one selected service must be paid to book. */
export function anyCollectsPayment(eventTypes: EventTypeLike[]): boolean {
  return eventTypes.some((et) => et.collectPayment && et.price > 0);
}

/** True when at least one selected service requires manual confirmation. */
export function anyRequiresConfirmation(eventTypes: EventTypeLike[]): boolean {
  return eventTypes.some((et) => et.requiresConfirmation);
}

/**
 * Compact payload stored on the Stripe Checkout session (metadata values are
 * limited to 500 chars) so the webhook can rebuild the service list and the
 * correct end time without another database round-trip.
 */
export function compactServiceItems(items: ServiceItem[]): string {
  return JSON.stringify(
    items.map((i) => ({
      id: i.eventTypeId,
      n: i.name,
      d: i.duration,
      p: i.collectPayment ? i.price : 0,
      c: i.currency,
    })),
  );
}

/** Inverse of compactServiceItems; null when absent or unparsable. */
export function parseServiceItems(
  raw: string | null | undefined,
): ServiceItem[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Array<{
      id: string;
      n: string;
      d: number;
      p: number;
      c: string;
    }>;
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    return parsed.map((x) => ({
      eventTypeId: x.id,
      name: x.n,
      duration: x.d,
      price: x.p || 0,
      currency: x.c || 'EUR',
      collectPayment: (x.p || 0) > 0,
      paymentInterval: null,
    }));
  } catch {
    return null;
  }
}

/** Human-readable label of a booking's services ("Corte + Barba"). */
export function serviceLabel(
  primaryName: string,
  serviceItems: ServiceItem[] | null | undefined,
): string {
  if (!serviceItems || serviceItems.length <= 1) return primaryName;
  return serviceItems.map((s) => s.name).join(' + ');
}