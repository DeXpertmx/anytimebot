/**
 * Tests for lib/payment-methods.ts (node:test + tsx, no network, no DB).
 *
 * The important distinction: a booking paid online (Stripe) must never be
 * treated as a manual collection, otherwise the revenue report would
 * misreport the cash drawer and the dashboard would offer to "annul" a
 * payment that actually has to be refunded through Stripe.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  MANUAL_PAYMENT_METHODS,
  isManualPaymentMethod,
  isPaymentMethod,
  isManualPayment,
  paymentMethodLabel,
} from '../lib/payment-methods';

describe('isManualPaymentMethod', () => {
  test('accepts every in-person method', () => {
    for (const method of MANUAL_PAYMENT_METHODS) {
      assert.equal(isManualPaymentMethod(method), true, method);
    }
  });

  test('rejects online and unknown values', () => {
    assert.equal(isManualPaymentMethod('CARD_ONLINE'), false);
    assert.equal(isManualPaymentMethod('BITCOIN'), false);
    assert.equal(isManualPaymentMethod(null), false);
    assert.equal(isManualPaymentMethod(undefined), false);
  });
});

describe('isPaymentMethod', () => {
  test('accepts online as well', () => {
    assert.equal(isPaymentMethod('CARD_ONLINE'), true);
    assert.equal(isPaymentMethod('CASH'), true);
  });

  test('rejects anything else', () => {
    assert.equal(isPaymentMethod('cash'), false);
    assert.equal(isPaymentMethod(''), false);
  });
});

describe('paymentMethodLabel', () => {
  test('translates known methods', () => {
    assert.equal(paymentMethodLabel('CASH'), 'Efectivo');
    assert.equal(paymentMethodLabel('CARD_ONLINE'), 'Tarjeta online (Stripe)');
  });

  test('is null-safe and never invents a label', () => {
    assert.equal(paymentMethodLabel(null), null);
    assert.equal(paymentMethodLabel(undefined), null);
    assert.equal(paymentMethodLabel('BITCOIN'), 'BITCOIN');
  });
});

describe('isManualPayment', () => {
  test('a manual method is always manual', () => {
    assert.equal(isManualPayment({ paymentMethod: 'CASH' }), true);
    assert.equal(isManualPayment({ paymentMethod: 'BIZUM', stripeSessionId: 'cs_live_x' }), true);
  });

  test('an online payment is not manual', () => {
    assert.equal(
      isManualPayment({ paymentMethod: 'CARD_ONLINE', stripeSessionId: 'cs_live_x' }),
      false
    );
  });

  test('no method and no Stripe trace → recorded by hand (legacy rows included)', () => {
    assert.equal(isManualPayment({}), true);
    assert.equal(isManualPayment({ paymentMethod: null, stripeSessionId: null }), true);
  });

  test('a Stripe intent alone is enough to keep it online', () => {
    assert.equal(isManualPayment({ stripePaymentIntent: 'pi_123' }), false);
  });
});
