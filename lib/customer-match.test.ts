import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  attachCustomerToBooking,
  attachCustomersToBookings,
  type BookingCustomerView,
} from './customer-match';

const customer = (email: string, photo?: string): BookingCustomerView => ({
  id: `cust-${email}`,
  name: 'Juan Pérez',
  email,
  photo: photo ?? null,
  company: 'Barbería Demo',
  phone: '+34 600 000 000',
});

describe('attachCustomerToBooking', () => {
  const byEmail = new Map<string, BookingCustomerView>();
  byEmail.set('juan@demo.com', customer('juan@demo.com', '/api/storage/foto.jpg'));

  test('attaches the customer when guest email matches (case-insensitive)', () => {
    const booking = { id: 'b1', guestEmail: 'JUAN@Demo.com' };
    const out = attachCustomerToBooking(booking, byEmail);
    assert.equal(out.customer?.photo, '/api/storage/foto.jpg');
    assert.equal(out.customer?.name, 'Juan Pérez');
    assert.equal(out.id, 'b1');
  });

  test('returns customer null when email has no match', () => {
    const out = attachCustomerToBooking({ id: 'b2', guestEmail: 'otro@demo.com' }, byEmail);
    assert.equal(out.customer, null);
  });

  test('returns customer null when booking has no guest email', () => {
    const out = attachCustomerToBooking({ id: 'b3', guestEmail: null }, byEmail);
    assert.equal(out.customer, null);
  });
});

describe('attachCustomersToBookings', () => {
  const byEmail = new Map<string, BookingCustomerView>();
  byEmail.set('ana@demo.com', customer('ana@demo.com'));

  test('maps a list of bookings preserving order and shape', () => {
    const bookings = [
      { id: 'a', guestEmail: 'Ana@demo.com' },
      { id: 'b', guestEmail: 'sin-cuenta@demo.com' },
    ];
    const out = attachCustomersToBookings(bookings, byEmail);
    assert.equal(out.length, 2);
    assert.equal(out[0].customer?.id, 'cust-ana@demo.com');
    assert.equal(out[1].customer, null);
    // No mutation of the input list
    assert.equal((bookings as any)[0].customer, undefined);
  });
});
