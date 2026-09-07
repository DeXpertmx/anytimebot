/**
 * Tests for lib/multi-service.ts — combined multi-service bookings
 * (e.g. "Corte de cabello" + "Barba" as a single block).
 * Runs with node:test + tsx, no network, no DB.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildServiceItems,
  totalDuration,
  maxBuffer,
  combinedName,
  totalPrice,
  anyCollectsPayment,
  anyRequiresConfirmation,
  compactServiceItems,
  parseServiceItems,
  serviceLabel,
} from './multi-service';

const corte = {
  id: 'et-corte',
  name: 'Corte de cabello',
  duration: 30,
  price: 1500,
  currency: 'EUR',
  collectPayment: true,
  paymentInterval: null,
  bufferTime: 5,
  requiresConfirmation: false,
};

const barba = {
  id: 'et-barba',
  name: 'Barba',
  duration: 20,
  price: 800,
  currency: 'EUR',
  collectPayment: true,
  paymentInterval: null,
  bufferTime: 0,
  requiresConfirmation: false,
};

const gratis = {
  id: 'et-gratis',
  name: 'Consulta',
  duration: 15,
  price: 0,
  currency: 'EUR',
  collectPayment: false,
  paymentInterval: null,
  bufferTime: 0,
  requiresConfirmation: true,
};

describe('totalDuration / maxBuffer', () => {
  test('sums durations of the selected services', () => {
    assert.equal(totalDuration([corte, barba]), 50);
    assert.equal(totalDuration([corte]), 30);
  });
  test('uses the largest buffer', () => {
    assert.equal(maxBuffer([corte, barba]), 5);
    assert.equal(maxBuffer([barba, gratis]), 0);
  });
});

describe('combinedName / serviceLabel', () => {
  test('joins names with +', () => {
    assert.equal(combinedName([corte, barba]), 'Corte de cabello + Barba');
  });
  test('serviceLabel falls back to the primary name for single services', () => {
    assert.equal(serviceLabel('Corte', null), 'Corte');
    assert.equal(serviceLabel('Corte', [{ eventTypeId: 'x', name: 'Corte', duration: 30, price: 0, currency: 'EUR', collectPayment: false }]), 'Corte');
  });
  test('serviceLabel uses the combined list when several services', () => {
    const items = buildServiceItems([corte, barba]);
    assert.equal(serviceLabel('Corte de cabello', items), 'Corte de cabello + Barba');
  });
});

describe('pricing', () => {
  test('totalPrice sums only paid services', () => {
    assert.equal(totalPrice([corte, barba, gratis]), 2300);
    assert.equal(totalPrice([gratis]), 0);
  });
  test('anyCollectsPayment', () => {
    assert.equal(anyCollectsPayment([corte, barba]), true);
    assert.equal(anyCollectsPayment([gratis]), false);
  });
});

describe('requiresConfirmation', () => {
  test('true when any selected service requires it', () => {
    assert.equal(anyRequiresConfirmation([corte, gratis]), true);
    assert.equal(anyRequiresConfirmation([corte, barba]), false);
  });
});

describe('compact round-trip (Stripe metadata)', () => {
  test('buildServiceItems -> compact -> parse preserves the list', () => {
    const items = buildServiceItems([corte, barba]);
    const compact = compactServiceItems(items);
    const parsed = parseServiceItems(compact);
    assert.ok(parsed);
    assert.equal(parsed!.length, 2);
    assert.equal(parsed![0].name, 'Corte de cabello');
    assert.equal(parsed![0].duration, 30);
    assert.equal(parsed![0].price, 1500);
    assert.equal(parsed![1].name, 'Barba');
  });
  test('parseServiceItems returns null for empty/garbage input', () => {
    assert.equal(parseServiceItems(null), null);
    assert.equal(parseServiceItems(undefined), null);
    assert.equal(parseServiceItems(''), null);
    assert.equal(parseServiceItems('not-json'), null);
    assert.equal(parseServiceItems('[]'), null);
  });
});