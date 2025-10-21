
import { prisma } from './db';

/**
 * Get available time slots for an event type
 */
export async function getAvailableSlots(
  eventTypeId: string,
  daysAhead: number = 7
): Promise<any[]> {
  const eventType = await prisma.eventType.findUnique({
    where: { id: eventTypeId },
    include: {
      bookingPage: {
        include: {
          availability: true,
          user: true,
        },
      },
      bookings: {
        where: {
          status: {
            in: ['PENDING', 'CONFIRMED'],
          },
        },
      },
    },
  });

  if (!eventType) {
    return [];
  }

  const slots: any[] = [];
  const now = new Date();
  const availability = eventType.bookingPage.availability;

  // Generate slots for next N days
  for (let i = 0; i < daysAhead; i++) {
    const day = new Date(now);
    day.setDate(day.getDate() + i);
    const dayOfWeek = day.getDay();

    // Find availability for this day
    const dayAvailability = availability.find(
      (a) => a.dayOfWeek === dayOfWeek && a.isAvailable
    );

    if (!dayAvailability) continue;

    // Parse start and end times
    const [startHour, startMinute] = dayAvailability.startTime.split(':').map(Number);
    const [endHour, endMinute] = dayAvailability.endTime.split(':').map(Number);

    let currentSlot = new Date(day);
    currentSlot.setHours(startHour, startMinute, 0, 0);

    const endTime = new Date(day);
    endTime.setHours(endHour, endMinute, 0, 0);

    // Generate slots with interval
    const slotInterval = eventType.bookingPage.slotInterval || 30;

    while (currentSlot < endTime) {
      const slotEnd = new Date(currentSlot.getTime() + eventType.duration * 60 * 1000);

      // Check if slot is in the future
      if (currentSlot > now) {
        // Check if slot is not already booked
        const isBooked = eventType.bookings.some((booking) => {
          const bookingStart = new Date(booking.startTime);
          const bookingEnd = new Date(booking.endTime);
          
          return (
            (currentSlot > bookingStart && currentSlot < bookingEnd) ||
            (slotEnd > bookingStart && slotEnd < bookingEnd) ||
            (currentSlot < bookingStart && slotEnd > bookingEnd)
          );
        });

        if (!isBooked) {
          slots.push({
            startTime: currentSlot.toISOString(),
            endTime: slotEnd.toISOString(),
            eventTypeId: eventType.id,
            eventTypeName: eventType.name,
            duration: eventType.duration,
          });
        }
      }

      // Move to next slot
      currentSlot = new Date(currentSlot.getTime() + slotInterval * 60 * 1000);
    }
  }

  return slots.slice(0, 20); // Return max 20 slots
}

/**
 * Create a booking from WhatsApp
 */
export async function createBookingFromWhatsApp(
  eventTypeId: string,
  guestName: string,
  guestPhone: string,
  startTime: string
): Promise<any> {
  const eventType = await prisma.eventType.findUnique({
    where: { id: eventTypeId },
  });

  if (!eventType) {
    throw new Error('Event type not found');
  }

  const start = new Date(startTime);
  const end = new Date(start.getTime() + eventType.duration * 60 * 1000);

  const booking = await prisma.booking.create({
    data: {
      eventTypeId,
      guestName,
      guestEmail: `${guestPhone.replace('+', '')}@whatsapp.temp`, // Temporary email
      guestPhone,
      startTime: start,
      endTime: end,
      status: 'CONFIRMED',
    },
  });

  return booking;
}
