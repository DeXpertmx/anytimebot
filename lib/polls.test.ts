/**
 * Tests for lib/polls.ts (node:test + tsx, no IO).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  slotEnd,
  participantLookupKey,
  validSlotIds,
  aggregateSlotTallies,
  rankSlots,
  formatSlotRange,
} from './polls';

test('slotEnd adds the duration to the start time', () => {
  const start = new Date('2026-09-10T09:00:00Z');
  assert.equal(slotEnd(start, 30).toISOString(), '2026-09-10T09:30:00.000Z');
  assert.equal(slotEnd('2026-09-10T09:00:00Z', 60).toISOString(), '2026-09-10T10:00:00.000Z');
});

test('participantLookupKey prefers the email, falls back to the name', () => {
  assert.equal(participantLookupKey('Ana', 'ANA@X.com'), 'ana@x.com');
  assert.equal(participantLookupKey('Ana Pérez', null), 'name:ana pérez');
  assert.equal(participantLookupKey('', ''), 'name:');
});

test('validSlotIds keeps only ids that belong to the poll (deduped)', () => {
  const allowed = ['a', 'b', 'c'];
  assert.deepEqual(validSlotIds(['b', 'x', 'a', 'b'], allowed), ['b', 'a']);
  assert.deepEqual(validSlotIds('b', allowed), []);
  assert.deepEqual(validSlotIds(null, allowed), []);
});

test('aggregateSlotTallies counts votes and lists who voted per slot', () => {
  const tally = aggregateSlotTallies(['s1', 's2'], [
    { slotId: 's1', participant: { name: 'Ana' } },
    { slotId: 's1', participant: { name: 'Bruno' } },
    { slotId: 's1', participant: { name: 'Ana' } }, // duplicate same name, ignored
    { slotId: 's2', participant: { name: 'Carla', email: 'carla@x.com' } },
  ]);
  assert.equal(tally.get('s1')!.count, 2);
  assert.deepEqual(tally.get('s1')!.names, ['Ana', 'Bruno']);
  assert.equal(tally.get('s2')!.count, 1);
  assert.deepEqual(tally.get('s2')!.names, ['Carla']);
  assert.equal(tally.get('missing'), undefined);
});

test('aggregateSlotTallies falls back to the email when no name', () => {
  const tally = aggregateSlotTallies(['s1'], [
    { slotId: 's1', participant: { email: 'only@mail.com' } },
  ]);
  assert.deepEqual(tally.get('s1')!.names, ['only@mail.com']);
});

test('rankSlots orders by vote count then earliest start', () => {
  const ranked = rankSlots([
    { id: 'a', startTime: '2026-09-10T09:00:00Z', count: 2 },
    { id: 'b', startTime: '2026-09-11T09:00:00Z', count: 4 },
    { id: 'c', startTime: '2026-09-10T08:00:00Z', count: 2 },
  ]);
  assert.deepEqual(
    ranked.map((s) => s.slotId),
    ['b', 'c', 'a'],
  );
});

test('formatSlotRange renders a readable range in the requested timezone', () => {
  const label = formatSlotRange(
    '2026-09-10T09:00:00Z',
    '2026-09-10T09:30:00Z',
    'Europe/Madrid',
  );
  assert.ok(label.includes('11:00'), `expected Madrid 11:00 in "${label}"`);
  assert.ok(label.includes('11:30'));
  assert.ok(label.includes('sep'));
});
