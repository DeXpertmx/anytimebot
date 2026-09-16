/**
 * Tests for lib/calendar-description.ts (node:test + tsx, pure).
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { buildCalendarDescription } from './calendar-description';

describe('buildCalendarDescription', () => {
  test('includes guest context lines', () => {
    const desc = buildCalendarDescription({
      guestName: 'Ana',
      guestEmail: 'ana@example.com',
    });
    assert.ok(desc.includes('Reserva con Ana'));
    assert.ok(desc.includes('Email: ana@example.com'));
    assert.ok(!desc.includes('Teléfono'));
    assert.ok(!desc.includes('🔗'));
  });

  test('includes phone when present', () => {
    const desc = buildCalendarDescription({
      guestName: 'Ana',
      guestEmail: 'ana@example.com',
      guestPhone: '+34600123456',
    });
    assert.ok(desc.includes('Teléfono: +34600123456'));
  });

  test('appends the Zoom link with provider label', () => {
    const desc = buildCalendarDescription({
      guestName: 'Ana',
      guestEmail: 'ana@example.com',
      meetingUrl: 'https://zoom.us/j/123456',
      meetingProvider: 'Zoom',
    });
    assert.ok(desc.includes('🔗 Zoom: https://zoom.us/j/123456'));
  });

  test('defaults the link label to "Reunión"', () => {
    const desc = buildCalendarDescription({
      guestName: 'Ana',
      guestEmail: 'ana@example.com',
      meetingUrl: 'https://teams.microsoft.com/l/meetup-join/x',
    });
    assert.ok(desc.includes('🔗 Reunión: https://teams.microsoft.com/l/meetup-join/x'));
  });

  test('includes venue line when present', () => {
    const desc = buildCalendarDescription({
      guestName: 'Ana',
      guestEmail: 'ana@example.com',
      venue: 'Sillón 2 · Sucursal Centro · Calle Mayor 1',
      meetingUrl: 'https://zoom.us/j/1',
      meetingProvider: 'Zoom',
    });
    assert.ok(desc.includes('Lugar: Sillón 2 · Sucursal Centro · Calle Mayor 1'));
    // Link goes last, after a blank line.
    assert.ok(desc.endsWith('🔗 Zoom: https://zoom.us/j/1'));
  });

  test('ignores empty meetingUrl', () => {
    const desc = buildCalendarDescription({
      guestName: 'Ana',
      guestEmail: 'ana@example.com',
      meetingUrl: '',
    });
    assert.ok(!desc.includes('🔗'));
  });
});
