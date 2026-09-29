import { prisma } from '@/lib/db';
import { OrderError, writeAudit } from '@/lib/orders';

type CashMovementType = 'SALE' | 'REFUND' | 'DEPOSIT' | 'WITHDRAWAL' | 'ADJUSTMENT';

/**
 * Cash drawer (caja) — open shifts, movements and the closing count (arqueo).
 *
 * One open session per (tenant, location); locationId = null is the single
 * physical drawer of tenants without branches. The closing freezes the period:
 * once CLOSED, no movements can be attached to the session and retroactive
 * edits of that period are rejected — money that came in later belongs to the
 * next shift.
 */

export interface CashDeps {
  prisma?: typeof prisma;
}

function resolveDeps(deps?: CashDeps) {
  return { db: deps?.prisma ?? prisma };
}

export interface ActorLike {
  id: string;
  name: string | null;
}

// ---------------------------------------------------------------------------
// Pure helpers (unit-tested without a database)
// ---------------------------------------------------------------------------

export interface MovementLike {
  direction: string; // IN | OUT
  method: string;
  amountCents: number;
}

export interface CashFlow {
  cashInCents: number;
  cashOutCents: number;
  expectedCents: number;
}

/**
 * Expected drawer balance: opening float + cash in − cash out. Only CASH rows
 * count — card/transfer money never touches the drawer.
 */
export function cashFlowFromMovements(openingCents: number, movements: MovementLike[]): CashFlow {
  let cashInCents = 0;
  let cashOutCents = 0;
  for (const m of movements) {
    if (m.method !== 'CASH') continue;
    if (!Number.isFinite(m.amountCents) || m.amountCents <= 0) continue;
    if (m.direction === 'IN') cashInCents += m.amountCents;
    else if (m.direction === 'OUT') cashOutCents += m.amountCents;
  }
  return { cashInCents, cashOutCents, expectedCents: openingCents + cashInCents - cashOutCents };
}

/** Arqueo difference: what was counted minus what was expected. */
export function cashDifferenceCents(countedCents: number, expectedCents: number): number {
  return countedCents - expectedCents;
}

/**
 * Period freeze: after a session is CLOSED, its movements are immutable.
 * `date` is the moment of the attempted change; anything after the close must
 * target the next session.
 */
export function assertPeriodOpen(
  session: { status: string; closedAt?: Date | null } | null,
  date: Date = new Date()
): void {
  if (session && session.status === 'CLOSED') {
    const closedAt = session.closedAt ? session.closedAt.getTime() : 0;
    if (date.getTime() >= closedAt || date.getTime() <= closedAt) {
      throw new OrderError('La caja de ese período ya está cerrada. Registra el movimiento en la sesión actual.', 409);
    }
  }
}

// ---------------------------------------------------------------------------
// Open session lookup
// ---------------------------------------------------------------------------

/**
 * The tenant's currently open drawer for that location (null location matches
 * the null-location session). Returns null when the tenant does not use the
 * drawer — callers treat it as "skip the movement", never as an error.
 */
export async function getCashSession(
  args: { userId: string; locationId?: string | null },
  deps?: CashDeps
) {
  const { db } = resolveDeps(deps);
  return db.cashSession.findFirst({
    where: { userId: args.userId, status: 'OPEN', locationId: args.locationId ?? null },
    orderBy: { openedAt: 'desc' },
  });
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export interface OpenSessionInput {
  userId: string;
  locationId?: string | null;
  openingCents: number;
  note?: string | null;
  actor: ActorLike;
}

/** Open a drawer shift. Only one open session per (tenant, location). */
export async function openCashSession(input: OpenSessionInput, deps?: CashDeps) {
  const { db } = resolveDeps(deps);
  const openingCents = Math.round(Number(input.openingCents ?? 0));
  if (!Number.isFinite(openingCents) || openingCents < 0) {
    throw new OrderError('El fondo inicial no es válido', 400);
  }

  const existing = await getCashSession({ userId: input.userId, locationId: input.locationId }, deps);
  if (existing) {
    throw new OrderError('Ya hay una caja abierta para esta sucursal', 409);
  }

  const session = await db.cashSession.create({
    data: {
      userId: input.userId,
      locationId: input.locationId ?? null,
      status: 'OPEN',
      openingCents,
      note: input.note ?? null,
      openedById: input.actor.id,
    },
  });

  await writeAudit(db, {
    userId: input.userId,
    actorId: input.actor.id,
    actorName: input.actor.name,
    action: 'CASH_OPEN',
    targetId: session.id,
    details: { openingCents, locationId: input.locationId ?? null },
  });

  return session;
}

export interface CloseSessionInput {
  sessionId: string;
  userId: string;
  countedCents: number;
  note?: string | null;
  actor: ActorLike;
}

/**
 * Close the shift with the arqueo: compute the expected cash from the opening
 * float and the session's CASH movements, store counted + difference. The
 * summary also carries per-method totals for the closing report.
 */
export async function closeCashSession(input: CloseSessionInput, deps?: CashDeps) {
  const { db } = resolveDeps(deps);
  const countedCents = Math.round(Number(input.countedCents));
  if (!Number.isFinite(countedCents) || countedCents < 0) {
    throw new OrderError('El recuento físico no es válido', 400);
  }

  const session = await db.cashSession.findFirst({
    where: { id: input.sessionId, userId: input.userId },
    include: { movements: true },
  });
  if (!session) throw new OrderError('Sesión de caja no encontrada', 404);
  if (session.status === 'CLOSED') throw new OrderError('La caja ya está cerrada', 409);

  const flow = cashFlowFromMovements(session.openingCents, session.movements);
  const differenceCents = cashDifferenceCents(countedCents, flow.expectedCents);

  // Per-method totals of the whole shift (SALE movements only = revenue).
  const byMethod: Record<string, number> = {};
  for (const m of session.movements) {
    if (m.type !== 'SALE') continue;
    byMethod[m.method] = (byMethod[m.method] ?? 0) + m.amountCents;
  }

  const closed = await db.$transaction(async (tx: any) => {
    return tx.cashSession.update({
      where: { id: session.id },
      data: {
        status: 'CLOSED',
        closedAt: new Date(),
        closedById: input.actor.id,
        expectedCents: flow.expectedCents,
        countedCents,
        differenceCents,
        note: input.note ?? session.note,
      },
    });
  });

  await writeAudit(db, {
    userId: input.userId,
    actorId: input.actor.id,
    actorName: input.actor.name,
    action: 'CASH_CLOSE',
    targetId: session.id,
    details: {
      openingCents: session.openingCents,
      cashInCents: flow.cashInCents,
      cashOutCents: flow.cashOutCents,
      expectedCents: flow.expectedCents,
      countedCents,
      differenceCents,
      byMethod,
    },
  });

  return {
    session: closed,
    summary: {
      openingCents: session.openingCents,
      cashInCents: flow.cashInCents,
      cashOutCents: flow.cashOutCents,
      expectedCents: flow.expectedCents,
      countedCents,
      differenceCents,
      byMethod,
      movementCount: session.movements.length,
    },
  };
}

const MANUAL_TYPES = ['DEPOSIT', 'WITHDRAWAL', 'ADJUSTMENT'] as const;
export type ManualMovementType = (typeof MANUAL_TYPES)[number];

export interface ManualMovementInput {
  sessionId: string;
  userId: string;
  type: string;
  direction: 'IN' | 'OUT';
  amountCents: number;
  concept: string;
  actor: ActorLike;
}

/** Manual deposit/withdrawal/adjustment on an OPEN session (never on closed ones). */
export async function addManualMovement(input: ManualMovementInput, deps?: CashDeps) {
  const { db } = resolveDeps(deps);
  if (!(MANUAL_TYPES as readonly string[]).includes(input.type)) {
    throw new OrderError('Tipo de movimiento no válido', 400);
  }
  if (input.direction !== 'IN' && input.direction !== 'OUT') {
    throw new OrderError('Dirección del movimiento no válida', 400);
  }
  const amountCents = Math.round(Number(input.amountCents));
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    throw new OrderError('El importe debe ser mayor que cero', 400);
  }
  if (!input.concept || !input.concept.trim()) {
    throw new OrderError('Describe el movimiento', 400);
  }

  const session = await db.cashSession.findFirst({
    where: { id: input.sessionId, userId: input.userId },
  });
  if (!session) throw new OrderError('Sesión de caja no encontrada', 404);
  assertPeriodOpen(session); // throws 409 when CLOSED

  const movement = await db.cashMovement.create({
    data: {
      userId: input.userId,
      sessionId: session.id,
      direction: input.direction,
      type: input.type as CashMovementType,
      method: 'CASH',
      amountCents,
      concept: input.concept.trim(),
      createdById: input.actor.id,
    },
  });

  await writeAudit(db, {
    userId: input.userId,
    actorId: input.actor.id,
    actorName: input.actor.name,
    action: 'CASH_MOVEMENT',
    targetId: session.id,
    details: {
      movementId: movement.id,
      type: input.type,
      direction: input.direction,
      amountCents,
      concept: input.concept.trim(),
    },
  });

  return movement;
}
