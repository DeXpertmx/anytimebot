import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  activateFoundersBasicPurchase,
  revokeFoundersBasicRefund,
  type FoundersBasicDeps,
} from './founders-basic';

function session(overrides: Record<string, unknown> = {}) {
  return {
    id: 'cs_founders_1',
    payment_status: 'paid',
    payment_intent: 'pi_founders_1',
    metadata: { userId: 'user-1', plan: 'BASIC' },
    ...overrides,
  } as any;
}

function makeDeps(initialPlan: 'FREE' | 'BASIC' = 'FREE') {
  let user: { id: string; plan: 'FREE' | 'BASIC'; foundersBasicPaymentIntentId?: string; foundersBasicCheckoutSessionId?: string } | null = {
    id: 'user-1',
    plan: initialPlan,
  };
  const updates: unknown[] = [];
  const quotaPlans: string[] = [];

  const deps: FoundersBasicDeps = {
    prisma: {
      user: {
        findFirst: async (args: any) => {
          if (args.where?.foundersBasicPaymentIntentId === 'pi_founders_1') {
            return user?.foundersBasicPaymentIntentId === 'pi_founders_1'
              ? { id: user.id, plan: user.plan }
              : null;
          }
          if (args.where?.OR) {
            return user?.plan === 'BASIC' ? { id: user.id } : null;
          }
          return null;
        },
        findUnique: async () => user,
        update: async (args: any) => {
          updates.push(args);
          const data = args.data;
          user = {
            ...user!,
            plan: data.plan ?? user!.plan,
            foundersBasicPaymentIntentId: data.foundersBasicPaymentIntentId ?? undefined,
            foundersBasicCheckoutSessionId: data.foundersBasicCheckoutSessionId ?? undefined,
          };
          return user;
        },
      },
    },
    initializeQuotas: async (_userId, plan) => {
      quotaPlans.push(plan);
    },
  };

  return { deps, updates, quotaPlans, getUser: () => user };
}

describe('founders basic entitlement', () => {
  it('activates a paid checkout once and ignores a duplicate delivery', async () => {
    const state = makeDeps();
    const checkout = session();

    assert.equal(await activateFoundersBasicPurchase(checkout, state.deps), true);
    assert.equal(await activateFoundersBasicPurchase(checkout, state.deps), false);
    assert.equal(state.getUser()?.plan, 'BASIC');
    assert.deepEqual(state.quotaPlans, ['BASIC']);
    assert.equal(state.updates.length, 1);
  });

  it('does not activate unpaid or incomplete checkouts', async () => {
    const state = makeDeps();

    assert.equal(await activateFoundersBasicPurchase(session({ payment_status: 'unpaid' }), state.deps), false);
    assert.equal(await activateFoundersBasicPurchase(session({ payment_intent: null }), state.deps), false);
    assert.equal(state.updates.length, 0);
    assert.deepEqual(state.quotaPlans, []);
  });

  it('revokes the entitlement after a full refund', async () => {
    const state = makeDeps('BASIC');
    const user = state.getUser()!;
    user.foundersBasicPaymentIntentId = 'pi_founders_1';

    assert.equal(await revokeFoundersBasicRefund({ refunded: false, payment_intent: 'pi_founders_1' } as any, state.deps), false);
    assert.equal(await revokeFoundersBasicRefund({ refunded: true, payment_intent: 'pi_founders_1' } as any, state.deps), true);
    assert.equal(state.getUser()?.plan, 'FREE');
    assert.deepEqual(state.quotaPlans, ['FREE']);
  });
});
