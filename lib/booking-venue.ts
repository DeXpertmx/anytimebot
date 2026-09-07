/**
 * Booking venue helper — builds a human-readable "where" from the snapshot
 * stored on a booking (resource + sede name + address). Used by the public
 * booking UI and by transactional emails so the guest always sees the real
 * physical venue of an in-person appointment (default sede or assigned
 * room/chair), falling back to undefined when the booking has no venue info.
 */
export interface VenueLike {
  resourceName?: string | null;
  locationName?: string | null;
  locationAddress?: string | null;
}

/**
 * "Sillón 2 · Sucursal Centro · Calle Mayor 1" or undefined when no venue
 * was recorded (video/phone events, or legacy bookings).
 */
export function bookingVenueText(booking: VenueLike): string | undefined {
  const parts: string[] = [];
  if (booking.locationName) parts.push(booking.locationName);
  if (booking.locationAddress) parts.push(booking.locationAddress);
  if (parts.length > 0 && booking.resourceName) parts.unshift(booking.resourceName);
  return parts.length > 0 ? parts.join(' · ') : undefined;
}
