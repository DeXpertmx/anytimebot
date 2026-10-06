import { prisma } from '@/lib/db';
import { OrderError, writeAudit, orderBalanceCents } from '@/lib/orders';
import { isManualPaymentMethod } from '@/lib/payment-methods';

/**
 * Payments — money actually collected against an order.
 *
 * Rules (approved in Fase 0):
 *  - amounts are > 0 integer cents; a payment belongs to exactly one order;
 *  - payments are never deleted: mistakes are annulled (ANNULLED + reason),
 *    returns are refunds (refundCents);
 *  - creation is idempotent per (userId, idempotencyKey) — a retried POST
 *    returns the existing payment instead of double charging;
 *  - cash payments move the open drawer (CashMovement SALE); refunds hand
 *    money back (OUT). No open session is never a hard error: tenants are not
 *    forced to use the drawer, it just skips the movement;
 *  - manual methods never touch Stripe. CARD_ONLINE rows are mirror records
 *    of real Stripe charges only, and Stripe refunds land on them through
 *    lib/stripe-refunds.ts (the webhook), never through this module.
 */

export interface PaymentDeps {
  prisma?: typeof prisma;
}

function resolveDeps(deps?: PaymentDeps) {
  return { db: deps?.prisma ?? prisma };
}

export interface ActorLike {
  id: string;
  name: string | null;
}

export interface AddPaymentInput {
  userId: string;
  orderId: string;
  method: string;
  amountCents: number;
  currency?: string | null;
  reference?: string | null;
  idempotencyKey?: string | null;
  stripePaymentIntent?: string | null;
  /** Historical mirrors (Stripe) must not create drawer movements. */
  skipCashMovement?: boolean;
  actor: ActorLike;
}

/** Validate one payment amount: integer cents > 0. */
export function validatePaymentAmount(amountCents: unknown): number {
  const cents = Math.round(Number(amountCents));
  if (!Number.isFinite(cents) || cents <= 0) {
    throw new OrderError('El importe debe ser mayor que cero', 400);
  }
  return cents;
}

/** Resolve the payment method: manual ones validated against the shared list. */
export function resolvePaymentMethod(method: unknown): string {
  if (method === 'CARD_ONLINE') return 'CARD_ONLINE'; // mirror rows only
  if (!isManualPaymentMethod(method)) {
    throw new OrderError('Método de pago no válido', 400);
  }
  return method;
}

/**
 * Add a payment to an order (total or partial). All-or-nothing transaction:
 * payment + application + cash movement are written together; the audit row is
 * best-effort afterwards.
 */
export async function addPaymentToOrder(input: AddPaymentInput, deps?: PaymentDeps) {
  const { db } = resolveDeps(deps);
  const method = resolvePaymentMethod(input.method);
  const amountCents = validatePaymentAmount(input.amountCents);

  // Idempotency first: a retry with the same key returns the original row.
  if (input.idempotencyKey) {
    const existing = await db.payment.findUnique({
      where: { userId_idempotencyKey: { userId: input.userId, idempotencyKey: input.idempotencyKey } },
    });
    if (existing) return { payment: existing, idempotentReplay: true };
  }

  const result = await db.$transaction(async (tx: any) => {
    const order = await tx.order.findFirst({
      where: { id: input.orderId, userId: input.userId },
      include: { payments: true, items: true },
    });
    if (!order) throw new OrderError('Venta no encontrada', 404);
    if (order.status === 'VOID') throw new OrderError('La venta está anulada', 409);

    const currency = (input.currency || order.currency).toLowerCase();
    if (currency !== order.currency) {
      throw new OrderError('La moneda no coincide con la venta', 400);
    }

    const balance = orderBalanceCents(
      order.items.reduce((s: number, i: any) => s + i.quantity * i.unitCents, 0),
      order.payments
    );

    const payment = await tx.payment.create({
      data: {
        userId: input.userId,
        orderId: order.id,
        method,
        amountCents,
        currency,
        status: 'COMPLETED',
        reference: input.reference ?? null,
        stripePaymentIntent: input.stripePaymentIntent ?? null,
        idempotencyKey: input.idempotencyKey ?? null,
        createdById: input.actor.id,
        createdByName: input.actor.name ?? '—',
        applications: {
          create: { orderId: order.id, appliedCents: amountCents },
        },
      },
    });

    if (method === 'CASH' && !input.skipCashMovement) {
      await attachCashMovement(tx, {
        userId: input.userId,
        order: order,
        direction: 'IN',
        type: 'SALE',
        amountCents,
        concept: `Cobro venta ${order.receipt ? '' : ''}${order.id.slice(-6)}`,
        paymentId: payment.id,
        actorId: input.actor.id,
      });
    }

    return { payment, balanceBefore: balance, idempotentReplay: false };
  });

  if (!result.idempotentReplay) {
    await writeAudit(db, {
      userId: input.userId,
      actorId: input.actor.id,
      actorName: input.actor.name,
      action: 'PAYMENT_ADD',
      targetId: result.payment.id,
      details: {
        orderId: input.orderId,
        method,
        amountCents,
        dueBeforeCents: result.balanceBefore.due,
      },
    });
  }

  return result;
}

/**
 * Annul a payment (wrong amount, wrong order...). The row stays with
 * status = ANNULLED and the reason. A cash payment that already moved the
 * drawer gets a compensating OUT movement (an annulment is not a refund: the
 * collection never legally existed).
 */
export async function annulPayment(paymentId: string, userId: string, reason: string, actor: ActorLike, deps?: PaymentDeps) {
  const { db } = resolveDeps(deps);
  if (!reason || !reason.trim()) throw new OrderError('Indica el motivo de la anulación', 400);

  const payment = await db.payment.findFirst({
    where: { id: paymentId, userId },
    include: { order: { include: { items: true } } },
  });
  if (!payment) throw new OrderError('Pago no encontrado', 404);
  if (payment.status !== 'COMPLETED') throw new OrderError('El pago ya no está activo', 409);
  if ((payment.refundCents ?? 0) > 0) {
    throw new OrderError('No se puede anular un pago con reembolsos. Anula el reembolso registrándolo.', 409);
  }

  const updated = await db.$transaction(async (tx: any) => {
    const row = await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: 'ANNULLED',
        annulledReason: reason.trim(),
        annulledById: actor.id,
        annulledAt: new Date(),
      },
    });

    if (payment.method === 'CASH') {
      await attachCashMovement(tx, {
        userId,
        order: payment.order,
        direction: 'OUT',
        type: 'ADJUSTMENT',
        amountCents: payment.amountCents,
        concept: `Anulación de cobro (${payment.id.slice(-6)})`,
        paymentId: payment.id,
        actorId: actor.id,
      });
    }

    return row;
  });

  await writeAudit(db, {
    userId,
    actorId: actor.id,
    actorName: actor.name,
    action: 'PAYMENT_ANNUL',
    targetId: payment.id,
    details: { orderId: payment.orderId, amountCents: payment.amountCents, reason: reason.trim() },
  });

  return updated;
}

export interface RefundInput {
  paymentId: string;
  userId: string;
  amountCents?: number; // default: everything not refunded yet
  reason: string;
  actor: ActorLike;
}

/**
 * Manual refund: money handed back to the customer outside Stripe (or a mirror
 * of a Stripe refund for CARD_ONLINE rows). Partial refunds allowed up to the
 * non-refunded remainder. Cash refunds move the drawer OUT.
 */
export async function refundPayment(input: RefundInput, deps?: PaymentDeps) {
  const { db } = resolveDeps(deps);
  if (!input.reason || !input.reason.trim()) throw new OrderError('Indica el motivo del reembolso', 400);

  const payment = await db.payment.findFirst({
    where: { id: input.paymentId, userId: input.userId },
    include: { order: { include: { items: true } } },
  });
  if (!payment) throw new OrderError('Pago no encontrado', 404);
  if (payment.status !== 'COMPLETED') throw new OrderError('El pago ya no está activo', 409);

  const refundable = payment.amountCents - (payment.refundCents ?? 0);
  const amount = input.amountCents === undefined || input.amountCents === null ? refundable : validatePaymentAmount(input.amountCents);
  if (amount > refundable) {
    throw new OrderError('El reembolso supera lo pendiente de devolver', 400);
  }

  const updated = await db.$transaction(async (tx: any) => {
    const row = await tx.payment.update({
      where: { id: payment.id },
      data: {
        refundCents: (payment.refundCents ?? 0) + amount,
        refundReason: input.reason.trim(),
        refundedAt: new Date(),
      },
    });

    if (payment.method === 'CASH') {
      await attachCashMovement(tx, {
        userId: input.userId,
        order: payment.order,
        direction: 'OUT',
        type: 'REFUND',
        amountCents: amount,
        concept: `Reembolso (${payment.id.slice(-6)})`,
        paymentId: payment.id,
        actorId: input.actor.id,
      });
    }

    return row;
  });

  await writeAudit(db, {
    userId: input.userId,
    actorId: input.actor.id,
    actorName: input.actor.name,
    action: 'PAYMENT_REFUND',
    targetId: payment.id,
    details: {
      orderId: payment.orderId,
      amountCents: amount,
      totalRefundCents: updated.refundCents,
      reason: input.reason.trim(),
    },
  });

  return updated;
}

/** Create the drawer movement inside an open transaction (no extra roundtrip). */
async function attachCashMovement(tx: any, args: {
  userId: string;
  order: { id: string; locationId?: string | null } | null;
  direction: 'IN' | 'OUT';
  type: 'SALE' | 'REFUND' | 'DEPOSIT' | 'WITHDRAWAL' | 'ADJUSTMENT';
  amountCents: number;
  concept: string;
  paymentId?: string | null;
  actorId: string;
}) {
  const { getCashSession } = await import('@/lib/cash');
  const session = await getCashSession({ userId: args.userId, locationId: args.order?.locationId ?? null }, { prisma: tx });
  if (!session) return; // no open drawer: the movement simply is not tracked
  await tx.cashMovement.create({
    data: {
      userId: args.userId,
      sessionId: session.id,
      direction: args.direction,
      type: args.type,
      method: 'CASH',
      amountCents: args.amountCents,
      concept: args.concept,
      paymentId: args.paymentId ?? null,
      orderId: args.order?.id ?? null,
      createdById: args.actorId,
    },
  });
}
