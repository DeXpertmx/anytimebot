import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  ensureStripeConnectAccount,
  createStripeConnectOnboardingLink,
  refreshStripeConnectStatus,
  getTenantStripeAccountId,
  type StripeConnectDeps,
} from './stripe-connect';

// Minimal Prisma-like client scoped to the models used by the layer.
function fakeDb(overrides: {
  findUnique?: (args: any) => Promise<any>;
  update?: (args: any) => Promise<any>;
}) {
  const db: any = {
    user: {
      findUnique: overrides.findUnique || (async () => null),
      update: overrides.update || (async () => ({})),
    },
  };
  return db;
}

// Loose Stripe-like client recording create/retrieve calls.
function fakeStripe(overrides: {
  accounts?: any;
  accountLinks?: any;
}) {
  const accounts = overrides.accounts ?? {
    create: async (args: any) => ({ id: 'acct_test_1', ...args }),
    retrieve: async (id: string) => ({
      id,
      details_submitted: false,
      charges_enabled: false,
      requirements: {},
    }),
  };
  const accountLinks = overrides.accountLinks ?? {
    create: async (args: any) => ({ url: `https://connect.stripe.com/setup/e/${args.account}` }),
  };
  const calls: string[] = [];
  return {
    calls,
    accounts: {
      create: async (args: any) => { calls.push('accounts.create'); return accounts.create(args); },
      retrieve: async (id: string) => { calls.push('accounts.retrieve'); return accounts.retrieve(id); },
    },
    accountLinks: {
      create: async (args: any) => { calls.push('accountLinks.create'); return accountLinks.create(args); },
    },
  };
}

function makeDeps(db: any, stripe: any): StripeConnectDeps<any> {
  return {
    prisma: db,
    getStripeImpl: async () => stripe,
    getModeImpl: async () => 'test' as const,
  };
}

const TENANT = { id: 'user_1', email: 'business@example.com', name: 'Business', country: 'ES', currency: 'EUR' };

beforeEach(() => {
  process.env.NEXT_PUBLIC_APP_URL = 'https://anytimebot.app';
});

afterEach(() => {
  delete process.env.NEXT_PUBLIC_APP_URL;
});

describe('stripe-connect', () => {
  it('creates a pending Express account when the tenant has none', async () => {
    const db = fakeDb({ findUnique: async () => ({ stripeAccountId: null, stripeAccountStatus: 'never' }) });
    const stripe = fakeStripe({});
    let updated: any = null;
    db.user.update = async (args: any) => { updated = args.data; return { ...args.data }; };

    const result = await ensureStripeConnectAccount(TENANT, makeDeps(db, stripe));

    assert.equal(result.status, 'pending');
    assert.ok(result.accountId);
    assert.deepEqual(stripe.calls, ['accounts.create']);
    assert.deepEqual(updated, { stripeAccountId: 'acct_test_1', stripeAccountStatus: 'pending' });
  });

  it('re-uses an existing account id instead of creating a new one', async () => {
    const db = fakeDb({ findUnique: async () => ({ stripeAccountId: 'acct_existing', stripeAccountStatus: 'connected' }) });
    const stripe = fakeStripe({});
    let updated = false;
    db.user.update = async () => { updated = true; return {}; };

    const result = await ensureStripeConnectAccount(TENANT, makeDeps(db, stripe));

    assert.equal(result.accountId, 'acct_existing');
    assert.equal(stripe.calls.length, 0, 'no Stripe API call for an existing account');
    assert.equal(updated, false, 'no DB update for an existing account');
  });

  it('creates the onboarding link against the stored account', async () => {
    const db = fakeDb({ findUnique: async () => ({ stripeAccountId: 'acct_123', stripeAccountStatus: 'pending' }) });
    const stripe = fakeStripe({});

    const url = await createStripeConnectOnboardingLink('user_1', 'https://anytimebot.app', makeDeps(db, stripe));

    assert.match(url, /^https:\/\/connect\.stripe\.com\//);
    assert.ok(url.includes('acct_123'));
    assert.deepEqual(stripe.calls, ['accountLinks.create']);
  });

  it('throws when no account exists for the onboarding link', async () => {
    const db = fakeDb({ findUnique: async () => ({ stripeAccountId: null, stripeAccountStatus: 'never' }) });
    const stripe = fakeStripe({});

    await assert.rejects(
      () => createStripeConnectOnboardingLink('user_1', 'https://anytimebot.app', makeDeps(db, stripe)),
      /No Stripe account yet/,
    );
  });

  it('marks the tenant connected when charges are enabled', async () => {
    const db = fakeDb({ findUnique: async () => ({ stripeAccountId: 'acct_123', stripeAccountStatus: 'pending' }) });
    let updated: any = null;
    db.user.update = async (args: any) => { updated = args.data; return {}; };
    const stripe = fakeStripe({
      accounts: { retrieve: async () => ({ id: 'acct_123', details_submitted: true, charges_enabled: true, requirements: {} }) },
    });

    const status = await refreshStripeConnectStatus('user_1', makeDeps(db, stripe));

    assert.equal(status.status, 'connected');
    assert.equal(status.chargesEnabled, true);
    assert.deepEqual(updated, { stripeAccountStatus: 'connected' });
  });

  it('keeps pending when details are not submitted', async () => {
    const db = fakeDb({ findUnique: async () => ({ stripeAccountId: 'acct_123', stripeAccountStatus: 'pending' }) });
    const stripe = fakeStripe({});

    const status = await refreshStripeConnectStatus('user_1', makeDeps(db, stripe));

    assert.equal(status.status, 'pending');
    assert.equal(status.chargesEnabled, false);
  });

  it('marks rejected when the account has a disabled reason', async () => {
    const db = fakeDb({ findUnique: async () => ({ stripeAccountId: 'acct_123', stripeAccountStatus: 'pending' }) });
    const stripe = fakeStripe({
      accounts: {
        retrieve: async () => ({
          id: 'acct_123',
          details_submitted: true,
          charges_enabled: false,
          requirements: { disabled_reason: 'requirements.past_due' },
        }),
      },
    });

    const status = await refreshStripeConnectStatus('user_1', makeDeps(db, stripe));

    assert.equal(status.status, 'rejected');
  });

  it('returns never when the tenant never connected', async () => {
    const db = fakeDb({ findUnique: async () => ({ stripeAccountId: null, stripeAccountStatus: 'never' }) });
    const stripe = fakeStripe({});

    const status = await refreshStripeConnectStatus('user_1', makeDeps(db, stripe));

    assert.equal(status.status, 'never');
    assert.equal(status.accountId, null);
    assert.equal(stripe.calls.length, 0);
  });

  it('getTenantStripeAccountId only returns connected accounts', async () => {
    const db = fakeDb({
      findUnique: async () => ({ stripeAccountId: 'acct_123', stripeAccountStatus: 'connected' }),
    });
    assert.equal(await getTenantStripeAccountId('user_1', { prisma: db }), 'acct_123');

    const dbPending = fakeDb({
      findUnique: async () => ({ stripeAccountId: 'acct_123', stripeAccountStatus: 'pending' }),
    });
    assert.equal(await getTenantStripeAccountId('user_1', { prisma: dbPending }), null);

    const dbNothing = fakeDb({ findUnique: async () => ({ stripeAccountId: null, stripeAccountStatus: 'never' }) });
    assert.equal(await getTenantStripeAccountId('user_1', { prisma: dbNothing }), null);
  });

  it('createStripeConnectOnboardingLink uses the configured origin for refresh/return URLs', async () => {
    const db = fakeDb({ findUnique: async () => ({ stripeAccountId: 'acct_123', stripeAccountStatus: 'pending' }) });
    let captured: any = null;
    const stripe = fakeStripe({
      accountLinks: {
        create: async (args: any) => { captured = args; return { url: 'https://connect.stripe.com/link' }; },
      },
    });

    await createStripeConnectOnboardingLink('user_1', 'https://anytimebot.app', makeDeps(db, stripe));

    assert.equal(captured.refresh_url, 'https://anytimebot.app/dashboard/settings?stripe=refresh');
    assert.equal(captured.return_url, 'https://anytimebot.app/dashboard/settings?stripe=return');
    assert.equal(captured.type, 'account_onboarding');
  });
});