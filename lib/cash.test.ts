/**
 * Tests for lib/cash.ts (node:test + tsx) — pure math + fake prisma flows.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  cashFlowFromMovements,
  cashDifferenceCents,
  assertPeriodOpen,
  openCashSession,
  closeCashSession,
  addManualMovement,
} from './cash';

const actor = { id: 'u1', name: 'Owner' };

// ---------------------------------------------------------------------------
// Pure math
// ---------------------------------------------------------------------------

test('cashFlowFromMovements sums only CASH rows with the right sign', () => {
  const flow = cashFlowFromMovements(5000, [
    { direction: 'IN', method: 'CASH', amountCents: 3000 },
    { direction: 'IN', method: 'CARD_ONSITE', amountCents: 10000 }, // never in the drawer
    { direction: 'OUT', method: 'CASH', amountCents: 1200 }, // refund
    { direction: 'IN', method: 'CASH', amountCents: -5 }, // ignored (invalid)
  ]);
  assert.equal(flow.cashInCents, 3000);
  assert.equal(flow.cashOutCents, 1200);
  assert.equal(flow.expectedCents, 6800);
});

test('cashDifferenceCents is counted minus expected', () => {
  assert.equal(cashDifferenceCents(6800, 6800), 0);
  assert.equal(cashDifferenceCents(6700, 6800), -100);
});

test('assertPeriodOpen throws only for CLOSED sessions', () => {
  assert.doesNotThrow(() => assertPeriodOpen(null));
  assert.doesNotThrow(() => assertPeriodOpen({ status: 'OPEN' }));
  assert.throws(
    () => assertPeriodOpen({ status: 'CLOSED', closedAt: new Date('2026-09-29T18:00:00Z') }, new Date('2026-09-29T19:00:00Z')),
    /cerrada/
  );
});

// ---------------------------------------------------------------------------
// Mutations against a fake prisma client
// ---------------------------------------------------------------------------

function makeFakeDb() {
  const sessions: any[] = [];
  const movements: any[] = [];
  const audit: any[] = [];
  let seq = 0;

  const db: any = {
    cashSession: {
      findFirst: async ({ where }: any) =>
        sessions.find((s) => {
          if (where.userId !== undefined && s.userId !== where.userId) return false;
          if (where.status !== undefined && s.status !== where.status) return false;
          if (where.locationId !== undefined && s.locationId !== (where.locationId ?? null)) return false;
          if (where.id !== undefined && s.id !== where.id) return false;
          return true;
        }) ?? null,
      create: async ({ data }: any) => {
        const s: any = { id: `ses_${++seq}`, movements: [], ...data };
        sessions.push(s);
        return s;
      },
      update: async ({ where, data }: any) => {
        const s = sessions.find((x) => x.id === where.id);
        Object.assign(s, data);
        return s;
      },
    },
    cashMovement: {
      create: async ({ data }: any) => {
        const m: any = { id: `mov_${++seq}`, ...data };
        movements.push(m);
        const s = sessions.find((x) => x.id === data.sessionId);
        if (s) s.movements.push(m);
        return m;
      },
    },
    tenantAuditLog: { create: async ({ data }: any) => void audit.push(data) },
    $transaction: async (fn: (tx: any) => any) => fn(db),
  };

  return { db, sessions, movements, audit };
}

test('openCashSession rejects a second open drawer for the same location', async () => {
  const { db } = makeFakeDb();
  await openCashSession({ userId: 'u1', openingCents: 5000, actor }, { prisma: db });
  await assert.rejects(
    () => openCashSession({ userId: 'u1', openingCents: 1000, actor }, { prisma: db }),
    (err: any) => err.status === 409
  );
});

test('closeCashSession computes arqueo: expected, counted, difference and per-method totals', async () => {
  const { db, sessions, audit } = makeFakeDb();
  const session = await openCashSession({ userId: 'u1', openingCents: 5000, actor }, { prisma: db });

  // Simulate a shift: cash sale, card sale, cash refund, manual withdrawal.
  await addManualMovement({ sessionId: session.id, userId: 'u1', type: 'ADJUSTMENT', direction: 'IN', amountCents: 3000, concept: 'cobro venta', actor }, { prisma: db });
  await addManualMovement({ sessionId: session.id, userId: 'u1', type: 'ADJUSTMENT', direction: 'OUT', amountCents: 800, concept: 'reembolso', actor }, { prisma: db });
  await addManualMovement({ sessionId: session.id, userId: 'u1', type: 'WITHDRAWAL', direction: 'OUT', amountCents: 2000, concept: 'retiro para banco', actor }, { prisma: db });

  const { session: closed, summary } = await closeCashSession(
    { sessionId: session.id, userId: 'u1', countedCents: 5150, actor },
    { prisma: db }
  );

  assert.equal(closed.status, 'CLOSED');
  assert.equal(summary.expectedCents, 5200); // 5000 + 3000 - 800 - 2000
  assert.equal(summary.differenceCents, -50); // faltan 50 céntimos en el cajón
  assert.equal(summary.cashInCents, 3000);
  assert.equal(summary.cashOutCents, 2800);
  assert.equal(audit.filter((a) => a.action === 'CASH_CLOSE').length, 1);
  assert.equal(sessions[0].status, 'CLOSED');

  // The period is frozen: no more movements on the closed session.
  await assert.rejects(
    () =>
      addManualMovement(
        { sessionId: session.id, userId: 'u1', type: 'DEPOSIT', direction: 'IN', amountCents: 100, concept: 'tarde', actor },
        { prisma: db }
      ),
    /cerrada/
  );

  // And a new shift can open for the same tenant.
  const next = await openCashSession({ userId: 'u1', openingCents: 5150, actor }, { prisma: db });
  assert.equal(next.status, 'OPEN');
});
