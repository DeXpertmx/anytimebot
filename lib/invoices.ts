import { prisma } from '@/lib/db';

/**
 * Basic invoicing for paid bookings.
 *
 * Flow: a booking is billed when the host marks a PAID booking as COMPLETED
 * (i.e. the service was actually rendered). At that moment the system issues
 * one invoice per booking (idempotent, enforced by the unique bookingId):
 *   - sequential number per owner + year: INV-2026-00001
 *   - line items from the booking (multi-service list or the single event)
 *   - immutable snapshots of the issuer (tenant) and the customer
 *   - total = the exact amount charged (booking.paymentAmount)
 *
 * Refunding the booking afterwards marks its invoice as CANCELLED (the guest
 * keeps a record of the reversal but it is excluded from future accounting).
 *
 * Everything is best-effort in the callers: an invoicing failure must never
 * break finalizing a booking (same pattern as lib/webhooks.ts).
 */

/** Injectable deps so the module is testable without a database. */
export interface InvoiceDeps {
  prisma?: typeof prisma;
}

function resolveDeps(deps?: InvoiceDeps) {
  return { db: deps?.prisma ?? prisma };
}

export type InvoiceStatusValue = 'ISSUED' | 'CANCELLED';

export interface InvoiceLineItem {
  name: string;
  description?: string | null;
  quantity: number;
  unitPriceCents: number;
  totalCents: number;
  durationMinutes?: number;
}

interface ServiceItemLike {
  eventTypeId?: string;
  name?: string;
  duration?: number;
  price?: number;
  currency?: string;
  collectPayment?: boolean;
  paymentInterval?: string | null;
}

interface BookingLike {
  id: string;
  guestName: string;
  guestEmail: string;
  startTime: Date;
  paymentAmount: number | null;
  paymentCurrency: string | null;
  paymentStatus: string | null;
  status: string;
  serviceItems?: unknown;
  eventType: {
    id: string;
    name: string;
    duration: number;
    bookingPage: {
      id: string;
      userId: string;
      user: {
        id: string;
        name: string | null;
        email: string;
        company?: string | null;
        address?: string | null;
        country?: string | null;
      };
    };
  };
}

/** Parse the stored booking.serviceItems JSON (null when not multi-service). */
export function parseStoredServiceItems(raw: unknown): ServiceItemLike[] | null {
  if (!raw) return null;
  if (!Array.isArray(raw) || raw.length === 0) return null;
  return raw as ServiceItemLike[];
}

/**
 * Line items of the invoice. Multi-service bookings get one line per combined
 * service; regular bookings get a single line for the primary event type.
 */
export function buildInvoiceLineItems(booking: BookingLike): InvoiceLineItem[] {
  const rawServices = parseStoredServiceItems(booking.serviceItems);
  const paidServices =
    rawServices && rawServices.length > 0
      ? rawServices.filter((s) => typeof s.price === 'number' && s.price > 0)
      : [];

  if (paidServices.length > 0) {
    return paidServices.map((s) => ({
      name: s.name || booking.eventType.name,
      description: `Cita del ${formatDate(booking.startTime)}`,
      quantity: 1,
      unitPriceCents: s.price || 0,
      totalCents: s.price || 0,
      durationMinutes: s.duration,
    }));
  }

  const amount = booking.paymentAmount ?? 0;
  return [
    {
      name: booking.eventType.name,
      description: `Cita del ${formatDate(booking.startTime)} · ${booking.eventType.duration} min`,
      quantity: 1,
      unitPriceCents: amount,
      totalCents: amount,
      durationMinutes: booking.eventType.duration,
    },
  ];
}

function formatDate(date: Date): string {
  try {
    return date.toLocaleDateString('es-ES', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

/** Largest used sequence for the owner+year prefix (parse-safe). */
function usedSequences(existingNumbers: string[], yearPrefix: string): Set<number> {
  const used = new Set<number>();
  for (const number of existingNumbers) {
    const seq = parseInt(number.slice(yearPrefix.length), 10);
    if (!Number.isNaN(seq)) used.add(seq);
  }
  return used;
}

/**
 * Issue the invoice for a PAID + COMPLETED booking. Returns the invoice (the
 * existing one on repeat calls) or null when the booking is not billable.
 * Never throws.
 */
export async function ensureInvoiceForCompletedBooking(
  bookingId: string,
  deps?: InvoiceDeps,
): Promise<any | null> {
  try {
    const { db } = resolveDeps(deps);

    const booking = (await db.booking.findUnique({
      where: { id: bookingId },
      include: {
        eventType: {
          include: {
            bookingPage: {
              include: { user: true },
            },
          },
        },
      },
    })) as BookingLike | null;

    if (!booking) return null;
    // Only paid bookings that were actually completed get billed.
    if (booking.paymentStatus !== 'PAID' || booking.status !== 'COMPLETED') return null;
    const amount = booking.paymentAmount;
    if (!amount || amount <= 0) return null;

    // Idempotency: a booking must have at most one invoice.
    const existing = await db.invoice.findUnique({
      where: { bookingId },
    });
    if (existing) return existing;

    const owner = booking.eventType.bookingPage.user;
    const userId = booking.eventType.bookingPage.userId;

    const items = buildInvoiceLineItems(booking);
    const itemsTotal = items.reduce((sum, i) => sum + i.totalCents, 0);
    const totalAmount = amount || itemsTotal;

    // Sequential number within the year: INV-YYYY-NNNN. The unique
    // (userId, number) constraint guards against races; on collision we
    // simply re-scan and retry.
    const now = new Date();
    const yearPrefix = `INV-${now.getFullYear()}-`;
    let invoice: any = null;
    for (let attempt = 0; attempt < 5 && !invoice; attempt++) {
      const existingNumbers = await db.invoice.findMany({
        where: { userId, number: { startsWith: yearPrefix } },
        select: { number: true },
      });
      const used = usedSequences(
        existingNumbers.map((n: { number: string }) => n.number),
        yearPrefix,
      );
      let seq = 1;
      while (used.has(seq)) seq++;
      const number = `${yearPrefix}${String(seq).padStart(4, '0')}`;

      try {
        invoice = await db.invoice.create({
          data: {
            userId,
            bookingId,
            number,
            status: 'ISSUED',
            issueDate: now,
            serviceDate: booking.startTime,
            currency: (booking.paymentCurrency || 'EUR').toUpperCase(),
            totalAmount,
            vatRate: 0,
            vatAmount: 0,
            items: items as any,
            issuerName: owner.name || owner.email,
            issuerCompany: owner.company ?? null,
            issuerAddress: owner.address ?? null,
            issuerCountry: owner.country ?? null,
            issuerVatId: null,
            issuerEmail: owner.email,
            guestName: booking.guestName,
            guestEmail: booking.guestEmail,
          },
        });
      } catch (err: any) {
        // P2002 = unique constraint collision ((userId, number) or the unique
        // bookingId). A concurrent request may have already issued the invoice
        // — return it in that case; otherwise re-scan and retry the number.
        if (err?.code !== 'P2002') throw err;
        invoice = null;
        const raced = await db.invoice.findUnique({
          where: { bookingId },
        });
        if (raced) {
          invoice = raced;
          break;
        }
      }
    }
    if (invoice) {
      console.log(`🧾 Factura ${invoice.number} emitida para la reserva ${booking.id}`);
    }
    return invoice;
  } catch (error) {
    console.error('Failed to issue invoice for completed booking:', error);
    return null;
  }
}

/**
 * Mark the invoice of a booking as CANCELLED (used when the booking is
 * refunded). No-op when no invoice exists yet. Never throws.
 */
export async function cancelInvoiceForBooking(
  bookingId: string,
  deps?: InvoiceDeps,
): Promise<any | null> {
  try {
    const { db } = resolveDeps(deps);
    const invoice = await db.invoice.findUnique({
      where: { bookingId },
    });
    if (!invoice || invoice.status === 'CANCELLED') return null;
    const updated = await db.invoice.update({
      where: { id: invoice.id },
      data: { status: 'CANCELLED' },
    });
    console.log(`🧾 Factura ${invoice.number} anulada (reembolso de la reserva ${bookingId})`);
    return updated;
  } catch (error) {
    console.error('Failed to cancel invoice for booking:', error);
    return null;
  }
}
