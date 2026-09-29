import { prisma } from '@/lib/db';
import { buildInvoiceLineItems } from '@/lib/invoices';

/**
 * Orders — the chargeable document of the manual sales & payments module.
 *
 * An order is either a quick counter sale (bookingId = null) or the document
 * behind an appointment (bookingId set). Money is not stored on the order:
 * `Payment` rows settle it (several payments, partial or mixed methods), and
 * the balance helpers below are the single source of truth for "how much is
 * left to collect".
 *
 * Conventions (match the rest of the app): amounts are integer cents, currency
 * is the tenant's operating currency in lowercase, records are never deleted —
 * mistakes are annulled/voided with a reason, and every state change writes an
 * immutable TenantAuditLog row (best-effort, outside the main transaction).
 */

/** Injectable deps so the module is testable without a database. */
export interface OrderDeps {
  prisma?: typeof prisma;
}

function resolveDeps(deps?: OrderDeps) {
  return { db: deps?.prisma ?? prisma };
}

// ---------------------------------------------------------------------------
// Pure helpers (unit-tested without a database)
// ---------------------------------------------------------------------------

export interface OrderItemInput {
  description: string;
  quantity?: number;
  unitCents: number;
  taxRateBps?: number | null;
}

export type ValidateItemsResult =
  | { ok: true; normalized: Array<{ description: string; quantity: number; unitCents: number; taxRateBps: number | null }> }
  | { ok: false; error: string };

/** Validate order lines: at least one, positive quantity, non-negative cents. */
export function validateOrderItems(items: unknown): ValidateItemsResult {
  if (!Array.isArray(items) || items.length === 0) {
    return { ok: false, error: 'Añade al menos un concepto a la venta' };
  }
  const normalized: Array<{ description: string; quantity: number; unitCents: number; taxRateBps: number | null }> = [];
  for (const raw of items) {
    const item = (raw ?? {}) as OrderItemInput;
    const description = typeof item.description === 'string' ? item.description.trim() : '';
    if (!description) return { ok: false, error: 'Cada concepto necesita una descripción' };
    const quantity = item.quantity === undefined ? 1 : Math.round(Number(item.quantity));
    if (!Number.isFinite(quantity) || quantity < 1) {
      return { ok: false, error: `Cantidad no válida para «${description}»` };
    }
    const unitCents = Math.round(Number(item.unitCents));
    if (!Number.isFinite(unitCents) || unitCents < 0) {
      return { ok: false, error: `Importe no válido para «${description}»` };
    }
    let taxRateBps: number | null = null;
    if (item.taxRateBps !== undefined && item.taxRateBps !== null) {
      const rate = Math.round(Number(item.taxRateBps));
      if (!Number.isFinite(rate) || rate < 0 || rate > 10000) {
        return { ok: false, error: `IVA no válido para «${description}»` };
      }
      taxRateBps = rate;
    }
    normalized.push({ description, quantity, unitCents, taxRateBps });
  }
  return { ok: true, normalized };
}

/** Gross total of the order in cents (Σ quantity × unit). */
export function orderTotalCents(items: Array<{ quantity: number; unitCents: number }>): number {
  return items.reduce((sum, i) => sum + i.quantity * i.unitCents, 0);
}

export interface PaymentLike {
  status: string;
  amountCents: number;
  refundCents?: number | null;
}

/** Money collected with COMPLETED payments. */
export function paidCents(payments: PaymentLike[]): number {
  return payments.filter((p) => p.status === 'COMPLETED').reduce((sum, p) => sum + p.amountCents, 0);
}

/** Money returned (manual refunds) across COMPLETED payments. */
export function refundedCents(payments: PaymentLike[]): number {
  return payments
    .filter((p) => p.status === 'COMPLETED')
    .reduce((sum, p) => sum + (p.refundCents ?? 0), 0);
}

export interface OrderBalance {
  total: number;
  paid: number; // gross collected (before refunds)
  refunded: number;
  net: number; // paid - refunded (what the tenant actually kept)
  due: number; // still to collect (0 when overpaid)
  state: 'UNPAID' | 'PARTIAL' | 'PAID' | 'OVERPAID';
}

/**
 * Balance of an order against its payments. `net` (paid minus refunds) is what
 * counts towards "collected": a full refund leaves the order UNPAID again.
 */
export function orderBalanceCents(totalCents: number, payments: PaymentLike[]): OrderBalance {
  const paid = paidCents(payments);
  const refunded = refundedCents(payments);
  const net = paid - refunded;
  const due = Math.max(0, totalCents - net);
  let state: OrderBalance['state'];
  if (net <= 0) state = 'UNPAID';
  else if (net < totalCents) state = 'PARTIAL';
  else if (net === totalCents) state = 'PAID';
  else state = 'OVERPAID';
  return { total: totalCents, paid, refunded, net, due, state };
}

/** REC-2026-000123 style display number (year is the issue year). */
export function formatReceiptNumber(series: string, number: number, issuedAt: Date): string {
  const year = issuedAt.getFullYear();
  return `${series}-${year}-${String(number).padStart(6, '0')}`;
}

/** Next receipt sequence from the tenant's current maximum. */
export function nextReceiptNumber(currentMax: number): number {
  return (Number.isFinite(currentMax) ? currentMax : 0) + 1;
}

// ---------------------------------------------------------------------------
// Mutations (transactions + audit)
// ---------------------------------------------------------------------------

export interface Actor {
  id: string;
  name: string | null;
}

export interface CreateOrderInput {
  userId: string;
  currency: string; // tenant currency, lowercase
  items: OrderItemInput[];
  bookingId?: string | null;
  customerId?: string | null;
  locationId?: string | null;
  note?: string | null;
  actor: Actor;
}

/**
 * Create a quick-sale order (or the document for a booking) with its line
 * items and receipt in one transaction, then audit ORDER_CREATE.
 */
export async function createOrder(input: CreateOrderInput, deps?: OrderDeps) {
  const { db } = resolveDeps(deps);
  const items = validateOrderItems(input.items);
  if (!items.ok) throw new OrderError(items.error, 400);
  if (items.normalized.length === 0) throw new OrderError('Añade al menos un concepto a la venta', 400);

  const order = await db.$transaction(async (tx: any) => {
    // Sequential per-tenant receipt number (unique (userId, series, number)
    // guards races; on collision the whole tx retries from the caller).
    const previous = await tx.receipt.findFirst({
      where: { userId: input.userId, series: 'REC' },
      orderBy: { number: 'desc' },
      select: { number: true },
    });
    const receiptNumber = nextReceiptNumber(previous?.number ?? 0);

    const created = await tx.order.create({
      data: {
        userId: input.userId,
        bookingId: input.bookingId ?? null,
        customerId: input.customerId ?? null,
        locationId: input.locationId ?? null,
        status: 'ISSUED',
        currency: input.currency.toLowerCase(),
        note: input.note ?? null,
        createdById: input.actor.id,
        createdByName: input.actor.name ?? '—',
        items: {
          create: items.normalized.map((item, index) => ({
            description: item.description,
            quantity: item.quantity,
            unitCents: item.unitCents,
            taxRateBps: item.taxRateBps,
            position: index,
          })),
        },
        receipt: {
          create: { userId: input.userId, series: 'REC', number: receiptNumber },
        },
      },
      include: { items: true, receipt: true },
    });
    return created;
  });

  await writeAudit(db, {
    userId: input.userId,
    actorId: input.actor.id,
    actorName: input.actor.name,
    action: 'ORDER_CREATE',
    targetId: order.id,
    details: {
      totalCents: orderTotalCents(items.normalized),
      itemCount: items.normalized.length,
      bookingId: input.bookingId ?? null,
      receiptNumber: order.receipt?.number ?? null,
    },
  });

  return order;
}

/**
 * Void an order (wrong sale, duplicate...). Only allowed while nothing is
 * effectively collected: annul or refund its payments first — money already
 * kept must be reversed explicitly, never hidden behind a void.
 */
export async function voidOrder(orderId: string, userId: string, reason: string, actor: Actor, deps?: OrderDeps) {
  const { db } = resolveDeps(deps);
  if (!reason || !reason.trim()) throw new OrderError('Indica el motivo de la anulación', 400);

  const order = await db.order.findFirst({
    where: { id: orderId, userId },
    include: { payments: true, items: true },
  });
  if (!order) throw new OrderError('Venta no encontrada', 404);
  if (order.status === 'VOID') throw new OrderError('La venta ya está anulada', 409);

  const balance = orderBalanceCents(
    orderTotalCents(order.items),
    order.payments
  );
  if (balance.net > 0) {
    throw new OrderError(
      'Esta venta tiene cobros efectivos. Anula o reembolsa sus pagos antes de anularla.',
      409
    );
  }

  const updated = await db.$transaction(async (tx: any) => {
    return tx.order.update({
      where: { id: order.id },
      data: { status: 'VOID', note: reason.trim() },
    });
  });

  await writeAudit(db, {
    userId,
    actorId: actor.id,
    actorName: actor.name,
    action: 'ORDER_VOID',
    targetId: order.id,
    details: { reason: reason.trim() },
  });

  return updated;
}

// ---------------------------------------------------------------------------
// Booking bridge
// ---------------------------------------------------------------------------

interface BookingOrderLike {
  id: string;
  guestName: string;
  startTime: Date;
  paymentStatus: string | null;
  paymentMethod: string | null;
  paymentAmount: number | null;
  paymentCurrency: string | null;
  stripePaymentIntent?: string | null;
  serviceItems?: unknown;
  eventTypeId: string;
  eventType: {
    name: string;
    price: number | null;
    currency: string | null;
    duration: number;
    bookingPage: { userId: string; user: { currency?: string | null } };
  };
}

/**
 * Ensure an appointment has its order (idempotent). Used by the manual-payment
 * route so old-style bookings gain a real payment history without migrating
 * rows up front. A booking already paid with Stripe becomes an order with a
 * CARD_ONLINE payment row carrying the real PaymentIntent — Stripe itself is
 * never called from here.
 */
export async function ensureBookingOrder(booking: BookingOrderLike, actor: Actor, deps?: OrderDeps) {
  const { db } = resolveDeps(deps);
  const userId = booking.eventType.bookingPage.userId;

  const existing = await db.order.findFirst({ where: { bookingId: booking.id, userId } });
  if (existing) return existing;

  const lineItems = buildInvoiceLineItems({
    id: booking.id,
    guestName: booking.guestName,
    guestEmail: '', // not needed for lines
    startTime: booking.startTime,
    paymentAmount: booking.paymentAmount,
    paymentCurrency: booking.paymentCurrency,
    paymentStatus: booking.paymentStatus,
    status: 'COMPLETED',
    serviceItems: booking.serviceItems,
    eventType: {
      id: booking.eventTypeId,
      name: booking.eventType.name,
      duration: booking.eventType.duration,
      bookingPage: {
        id: booking.id,
        userId,
        user: { id: userId, name: null, email: '' },
      },
    },
  } as any);

  const items = lineItems.map((line: { name: string; quantity: number; unitPriceCents: number }) => ({
    description: line.name,
    quantity: line.quantity,
    unitCents: line.unitPriceCents,
  }));
  if (items.length === 0 || orderTotalCents(items) <= 0) {
    throw new OrderError('La cita no tiene importe que cobrar', 400);
  }

  const currency = (
    booking.paymentCurrency ||
    booking.eventType.currency ||
    booking.eventType.bookingPage.user.currency ||
    'EUR'
  ).toLowerCase();

  const created = await createOrder(
    {
      userId,
      currency,
      items,
      bookingId: booking.id,
      actor,
    },
    deps
  );

  // Mirror a Stripe-collected booking as a CARD_ONLINE payment row so the
  // balance reflects reality from the start (webhook-style record, no Stripe
  // API call).
  if (booking.paymentStatus === 'PAID' && booking.paymentAmount && booking.paymentAmount > 0) {
    const { addPaymentToOrder } = await import('@/lib/payments');
    await addPaymentToOrder(
      {
        userId,
        orderId: created.id,
        method: (booking.paymentMethod as any) ?? 'CARD_ONLINE',
        amountCents: booking.paymentAmount,
        stripePaymentIntent: booking.stripePaymentIntent ?? undefined,
        actor,
        skipCashMovement: true, // historical Stripe money never entered the drawer
      },
      deps
    );
  }

  return created;
}

// ---------------------------------------------------------------------------
// Audit + error
// ---------------------------------------------------------------------------

/** Best-effort immutable audit write — never breaks the main operation. */
export async function writeAudit(db: any, entry: {
  userId: string;
  actorId?: string | null;
  actorName?: string | null;
  action: string;
  targetId?: string | null;
  details: unknown;
}) {
  try {
    await db.tenantAuditLog.create({
      data: {
        userId: entry.userId,
        actorId: entry.actorId ?? null,
        actorName: entry.actorName ?? null,
        action: entry.action,
        targetId: entry.targetId ?? null,
        details: (entry.details ?? {}) as any,
      },
    });
  } catch (error) {
    console.error('tenant audit write failed:', error);
  }
}

/** Domain error carrying an HTTP status for the API routes. */
export class OrderError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = 'OrderError';
    this.status = status;
  }
}
