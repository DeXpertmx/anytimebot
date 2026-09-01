import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeAnnualSavings, type PricingEventType } from '@/lib/membership-pricing';

function event(overrides: Partial<PricingEventType> & { id: string; name: string; price: number }): PricingEventType {
  return {
    collectPayment: true,
    paymentInterval: 'ONE_TIME',
    currency: 'eur',
    ...overrides,
  };
}

test('annual savings: computes percent vs real monthly counterpart with same name', () => {
  const monthly = event({ id: 'm', name: 'Membresía', price: 5000, paymentInterval: 'MONTH' });
  const yearly = event({ id: 'y', name: 'Membresía', price: 50000, paymentInterval: 'YEAR' });

  const savings = computeAnnualSavings([monthly, yearly], yearly);
  assert.ok(savings);
  assert.equal(savings.savingsCents, 10000); // 5000*12 - 50000
  assert.equal(savings.monthlyEquivalent, 5000); // real counterpart, not prorated
  assert.equal(savings.percent, 17); // 10000 / 60000 = 16.67% -> 17
  assert.equal(savings.currency, 'eur');
});

test('annual savings: matches monthly counterpart case-insensitively and ignoring whitespace', () => {
  const monthly = event({ id: 'm', name: '  membresía ', price: 5000, paymentInterval: 'MONTH' });
  const yearly = event({ id: 'y', name: 'Membresía', price: 50000, paymentInterval: 'YEAR' });

  const savings = computeAnnualSavings([monthly, yearly], yearly);
  assert.ok(savings);
  assert.equal(savings.monthlyEquivalent, 5000);
  assert.equal(savings.percent, 17);
});

test('annual savings: falls back to prorated equivalent when no monthly counterpart exists (no savings)', () => {
  const yearly = event({ id: 'y', name: 'Membresía', price: 50000, paymentInterval: 'YEAR' });

  const savings = computeAnnualSavings([yearly], yearly);
  // prorated: 50000/12 * 12 - 50000 = 0 -> no discount shown
  assert.equal(savings, null);
});

test('annual savings: different names are not treated as counterparts', () => {
  const monthly = event({ id: 'm', name: 'Consulta', price: 5000, paymentInterval: 'MONTH' });
  const yearly = event({ id: 'y', name: 'Membresía', price: 50000, paymentInterval: 'YEAR' });

  assert.equal(computeAnnualSavings([monthly, yearly], yearly), null);
});

test('annual savings: returns null when yearly is not cheaper than 12 monthly payments', () => {
  const monthly = event({ id: 'm', name: 'Membresía', price: 4000, paymentInterval: 'MONTH' });
  const yearly = event({ id: 'y', name: 'Membresía', price: 50000, paymentInterval: 'YEAR' });

  // 4000*12 = 48000 < 50000 -> no savings
  assert.equal(computeAnnualSavings([monthly, yearly], yearly), null);
});

test('annual savings: monthly counterpart must be paid and priced', () => {
  const freeMonthly = event({ id: 'm', name: 'Membresía', price: 0, paymentInterval: 'MONTH', collectPayment: false });
  const yearly = event({ id: 'y', name: 'Membresía', price: 50000, paymentInterval: 'YEAR' });

  // no valid counterpart -> prorated fallback -> no savings
  assert.equal(computeAnnualSavings([freeMonthly, yearly], yearly), null);
});

test('annual savings: returns null for non-yearly events', () => {
  const monthly = event({ id: 'm', name: 'Membresía', price: 5000, paymentInterval: 'MONTH' });

  assert.equal(computeAnnualSavings([monthly], monthly), null);
});

test('annual savings: returns null for free or non-collect-payment yearly events', () => {
  const freeYearly = event({ id: 'y', name: 'Membresía', price: 0, paymentInterval: 'YEAR', collectPayment: false });

  assert.equal(computeAnnualSavings([freeYearly], freeYearly), null);
});

test('annual savings: ignores the event itself as its own counterpart', () => {
  const yearly = event({ id: 'y', name: 'Membresía', price: 50000, paymentInterval: 'YEAR' });
  const dupe = event({ id: 'y2', name: 'Membresía', price: 50000, paymentInterval: 'YEAR' });

  const savings = computeAnnualSavings([yearly, dupe], yearly);
  // 50000/12 prorated -> 0 savings
  assert.equal(savings, null);
});

test('annual savings: legacy events without paymentInterval are valid monthly counterparts', () => {
  const legacy = event({ id: 'm', name: 'Membresía', price: 5000, paymentInterval: null });
  const yearly = event({ id: 'y', name: 'Membresía', price: 50000, paymentInterval: 'YEAR' });

  const savings = computeAnnualSavings([legacy, yearly], yearly);
  assert.ok(savings);
  assert.equal(savings.monthlyEquivalent, 5000);
  assert.equal(savings.percent, 17);
});

test('annual savings: smaller discount percent when annual price is close to monthly total', () => {
  const monthly = event({ id: 'm', name: 'Plan', price: 10000, paymentInterval: 'MONTH' });
  const yearly = event({ id: 'y', name: 'Plan', price: 110000, paymentInterval: 'YEAR' });

  const savings = computeAnnualSavings([monthly, yearly], yearly);
  assert.ok(savings);
  assert.equal(savings.savingsCents, 10000); // 120000 - 110000
  assert.equal(savings.percent, 8); // 10000 / 120000 = 8.3% -> 8
});
