/**
 * Tests for lib/crm-merge.ts (node:test + tsx, no DB, no network).
 *
 * Prisma is an in-memory fake, so the whole merge (plan + apply) is covered:
 * tag/note union, field adoption, opt-out survival, campaign re-pointing and
 * the no-op paths.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeEmail,
  normalizePhone,
  mergeNotes,
  planCustomerMerge,
  describeCustomerMerge,
  findDuplicateGroups,
  findPhoneDuplicateGroups,
  mergeDuplicateCustomers,
  mergeContactIntoAddress,
  mergePhoneDuplicates,
  mergeContactIntoPhone,
  findContactsByPhone,
  adoptDraftIntoContact,
  sweepDuplicateCustomers,
  type MergeableCustomer,
} from './crm-merge';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
type Row = Record<string, any>;

/** Every seeded row belongs to this owner unless a test overrides it. */
const OWNER = 'u1';

let seq = 0;
function row(over: Partial<MergeableCustomer> = {}): MergeableCustomer {
  const n = ++seq;
  return {
    id: `c${n}`,
    userId: OWNER,
    email: 'juan@demo.com',
    name: null,
    company: null,
    phone: null,
    photo: null,
    notes: null,
    tags: [],
    marketingOptOut: false,
    createdAt: new Date(Date.UTC(2024, 0, n)),
    ...over,
  };
}

function makeDb(customers: MergeableCustomer[]) {
  const store = customers.map((c) => ({ ...c, tags: [...c.tags] }));
  const db = {
    store,
    updates: [] as Row[],
    deletes: [] as string[][],
    repoints: [] as Row[],
    customer: {
      // The real query narrows by owner + `contains`; each test seeds a single
      // owner's rows, so the fake only applies the email narrowing. Without a
      // `where` (the sweep) the whole table comes back.
      findMany: async ({ where }: any = {}) => {
        const rows = where?.userId ? store.filter((c) => c.userId === where.userId) : store;
        if (!where?.email?.contains) return rows.map((c) => ({ ...c }));
        const needle = String(where.email.contains).toLowerCase();
        return rows.filter((c) => c.email.toLowerCase().includes(needle));
      },
      update: async ({ where, data }: any) => {
        const target = store.find((c) => c.id === where.id)!;
        // Emulate the (user_id, email) unique index: writing an address that
        // another row of the SAME owner already holds must fail, like Postgres
        // would (two owners may share an address without clashing).
        if (data.email) {
          const clash = store.some(
            (c) => c.id !== target.id && c.userId === target.userId && c.email === data.email
          );
          if (clash) {
            const error = new Error('Unique constraint failed on the fields: (`user_id`,`email`)');
            (error as any).code = 'P2002';
            throw error;
          }
        }
        Object.assign(target, data);
        db.updates.push({ id: where.id, data });
        return target;
      },
      deleteMany: async ({ where }: any) => {
        const ids: string[] = where.id.in;
        db.deletes.push(ids);
        for (const id of ids) {
          const i = store.findIndex((c) => c.id === id);
          if (i >= 0) store.splice(i, 1);
        }
        return { count: ids.length };
      },
    },
    campaignRecipient: {
      updateMany: async ({ where, data }: any) => {
        db.repoints.push({ where, data });
        return { count: 1 };
      },
    },
  };
  return db;
}

/** Wrap the fake the way the real caller injects prisma. */
const runDeps = (db: unknown) => ({ prisma: db }) as any;

// ---------------------------------------------------------------------------
// normalizeEmail
// ---------------------------------------------------------------------------
describe('normalizeEmail', () => {
  test('trims and lowercases', () => {
    assert.equal(normalizeEmail('  Juan@Demo.COM '), 'juan@demo.com');
  });

  test('returns an empty string for null/undefined handling', () => {
    assert.equal(normalizeEmail(null), '');
    assert.equal(normalizeEmail(undefined), '');
  });
});

// ---------------------------------------------------------------------------
// mergeNotes
// ---------------------------------------------------------------------------
describe('normalizePhone', () => {
  test('strips spaces, dashes, parentheses and dots', () => {
    assert.equal(normalizePhone('+34 600 111 111'), '34600111111');
    assert.equal(normalizePhone('600-111-111'), '34600111111');
    assert.equal(normalizePhone('(+34) 600.111.111'), '34600111111');
  });

  test('expands the 00 international prefix', () => {
    assert.equal(normalizePhone('0034 600 111 111'), '34600111111');
  });

  test('assumes the Spanish code for a bare 9-digit number only', () => {
    assert.equal(normalizePhone('600111111'), '34600111111');
    assert.equal(normalizePhone('15551234567'), '15551234567', '11 digits: another country code, left as-is');
  });

  test('returns empty for null or garbage', () => {
    assert.equal(normalizePhone(null), '');
    assert.equal(normalizePhone('---'), '');
  });
});

describe('mergeNotes', () => {
  test('concatenates notes primary-first, separated by a blank line', () => {
    assert.equal(mergeNotes('Prefiere tardes', ['Llegó tarde en marzo']), 'Prefiere tardes\n\nLlegó tarde en marzo');
  });

  test('drops empty notes and exact duplicates', () => {
    assert.equal(mergeNotes(null, ['  ', 'Misma nota', 'Misma nota']), 'Misma nota');
  });

  test('returns null when nothing is left', () => {
    assert.equal(mergeNotes(null, [null, '   ']), null);
  });
});

// ---------------------------------------------------------------------------
// planCustomerMerge
// ---------------------------------------------------------------------------
describe('planCustomerMerge', () => {
  test('prefers the row already on the normalized email as survivor', () => {
    const old = row({ id: 'old', email: 'Juan@Demo.com', createdAt: new Date('2023-01-01') });
    const clean = row({ id: 'clean', email: 'juan@demo.com', createdAt: new Date('2024-06-01') });
    const plan = planCustomerMerge([old, clean], 'juan@demo.com');
    assert.equal(plan?.primaryId, 'clean');
    assert.deepEqual(plan?.duplicateIds, ['old']);
    assert.equal(plan?.merged.email, 'juan@demo.com');
  });

  test('falls back to the oldest row when no exact match exists', () => {
    const newer = row({ id: 'newer', email: 'JUAN@demo.com', createdAt: new Date('2024-05-01') });
    const older = row({ id: 'older', email: 'Juan@DEMO.com', createdAt: new Date('2022-02-02') });
    const plan = planCustomerMerge([newer, older], 'juan@demo.com');
    assert.equal(plan?.primaryId, 'older');
  });

  test('unions tags (lowercased, deduped, primary first) and adopts missing fields', () => {
    const primary = row({
      id: 'p',
      email: 'juan@demo.com',
      createdAt: new Date('2022-01-01'),
      name: 'Juan Pérez',
      phone: '+34 600 111 111',
      tags: ['VIP', 'barberia'],
    });
    const dup = row({
      id: 'd',
      email: 'JUAN@demo.com',
      createdAt: new Date('2024-01-01'),
      company: 'Barbería Demo',
      notes: 'Paga en efectivo',
      tags: ['vip', 'nuevo'],
      photo: '/api/storage/juan.jpg',
      marketingOptOut: true,
    });
    const plan = planCustomerMerge([primary, dup], 'juan@demo.com')!;
    assert.deepEqual(plan.merged.tags, ['vip', 'barberia', 'nuevo']);
    assert.equal(plan.merged.company, 'Barbería Demo');
    assert.equal(plan.merged.photo, '/api/storage/juan.jpg');
    assert.equal(plan.merged.name, 'Juan Pérez');
    assert.equal(plan.merged.phone, '+34 600 111 111');
    assert.equal(plan.merged.marketingOptOut, true, 'opt-out must survive the merge');
    assert.equal(plan.merged.createdAt.toISOString(), new Date('2022-01-01').toISOString());
  });

  test('keeps notes from every duplicate row', () => {
    const a = row({ id: 'a', email: 'juan@demo.com', notes: 'Cliente desde 2019', createdAt: new Date('2021-01-01') });
    const b = row({ id: 'b', email: 'JUAN@demo.com', notes: 'Prefiere las mañanas', createdAt: new Date('2023-01-01') });
    const c = row({ id: 'c', email: ' juan@demo.com ', notes: 'Alérgico al perfume fuerte', createdAt: new Date('2024-01-01') });
    const plan = planCustomerMerge([a, b, c], 'juan@demo.com')!;
    assert.deepEqual(plan.duplicateIds.sort(), ['b', 'c']);
    assert.equal(
      plan.merged.notes,
      'Cliente desde 2019\n\nPrefiere las mañanas\n\nAlérgico al perfume fuerte'
    );
  });

  test('ignores rows of other contacts and returns null when there is nothing to merge', () => {
    const other = row({ id: 'x', email: 'otro@demo.com' });
    assert.equal(planCustomerMerge([other], 'juan@demo.com'), null);
    assert.equal(planCustomerMerge([], 'juan@demo.com'), null);
  });

  test('an empty email previews the rows as given (phone groups)', () => {
    const a = row({ id: 'a', email: 'ana@demo.com', phone: '+34 600 111 111' });
    const b = row({ id: 'b', email: 'ana-trabajo@demo.com', phone: '600-111-111', notes: 'Otra ficha' });
    const plan = planCustomerMerge([a, b], '', 'a');
    assert.equal(plan?.primaryId, 'a');
    assert.deepEqual(plan?.duplicateIds, ['b']);
    assert.equal(plan?.merged.notes, 'Otra ficha');
  });
});

// ---------------------------------------------------------------------------
// describeCustomerMerge (preview with provenance)
// ---------------------------------------------------------------------------
describe('describeCustomerMerge', () => {
  const older = row({
    id: 'old',
    email: 'Juan@Demo.com',
    createdAt: new Date('2022-01-01'),
    name: 'Juan Pérez',
    phone: '+34 600 111 111',
    tags: ['vip'],
    notes: 'Cliente desde 2022',
    marketingOptOut: true,
  });
  const newer = row({
    id: 'new',
    email: 'juan@demo.com',
    createdAt: new Date('2024-05-05'),
    company: 'Barbería Demo',
    phone: '+34 699 999 999',
    tags: ['vip', 'nuevo'],
    notes: 'Llegó por Instagram',
  });

  test('reports where every kept value comes from', () => {
    const preview = describeCustomerMerge([older, newer], 'juan@demo.com')!;
    assert.equal(preview.primaryId, 'new');
    assert.deepEqual(preview.duplicateIds, ['old']);
    // The survivor has no name, so the legacy row provides it.
    assert.deepEqual(preview.fields.name, { value: 'Juan Pérez', fromId: 'old' });
    assert.deepEqual(preview.fields.company, { value: 'Barbería Demo', fromId: 'new' });
    // First meaningful value wins: the survivor's phone.
    assert.deepEqual(preview.fields.phone, { value: '+34 699 999 999', fromId: 'new' });
    assert.deepEqual(preview.fields.photo, { value: null, fromId: null });
    assert.equal(preview.marketingOptOut, true);
    assert.equal(preview.createdAt.toISOString(), new Date('2022-01-01').toISOString());
  });

  test('lists tags with the contacts that contributed them and keeps every note', () => {
    const preview = describeCustomerMerge([older, newer], 'juan@demo.com')!;
    assert.deepEqual(preview.tags, [
      { tag: 'vip', fromIds: ['new', 'old'] },
      { tag: 'nuevo', fromIds: ['new'] },
    ]);
    assert.deepEqual(preview.notes, [
      { text: 'Llegó por Instagram', fromId: 'new' },
      { text: 'Cliente desde 2022', fromId: 'old' },
    ]);
  });

  test('honours the contact the user picked to keep', () => {
    const preview = describeCustomerMerge([older, newer], 'juan@demo.com', 'old')!;
    assert.equal(preview.primaryId, 'old');
    assert.deepEqual(preview.duplicateIds, ['new']);
    // Name now comes from the survivor itself; the company is still adopted.
    assert.deepEqual(preview.fields.name, { value: 'Juan Pérez', fromId: 'old' });
    assert.deepEqual(preview.fields.company, { value: 'Barbería Demo', fromId: 'new' });
    // Phone is the survivor's own value now.
    assert.deepEqual(preview.fields.phone, { value: '+34 600 111 111', fromId: 'old' });
    assert.deepEqual(preview.notes.map((n) => n.fromId), ['old', 'new']);
  });

  test('returns null when there is nothing to preview', () => {
    assert.equal(describeCustomerMerge([], 'juan@demo.com'), null);
  });
});

// ---------------------------------------------------------------------------
// findDuplicateGroups
// ---------------------------------------------------------------------------
describe('findDuplicateGroups', () => {
  test('groups duplicated addresses per owner and skips lone contacts', async () => {
    const db = makeDb([
      row({ id: 'a1', email: 'juan@demo.com', createdAt: new Date('2022-01-01'), tags: ['vip'] }),
      row({ id: 'a2', email: 'JUAN@demo.com', createdAt: new Date('2024-01-01'), company: 'Demo SL' }),
      row({ id: 'b1', email: 'ana@demo.com' }),
      row({ id: 'c1', email: 'juan@demo.com', userId: 'u2' }),
    ]);

    const groups = await findDuplicateGroups('u1', runDeps(db));
    assert.equal(groups.length, 1);
    assert.equal(groups[0].email, 'juan@demo.com');
    assert.deepEqual(groups[0].contacts.map((c) => c.id), ['a1', 'a2']);
    assert.equal(groups[0].preview.fields.company.value, 'Demo SL');
    assert.equal(groups[0].preview.primaryId, 'a1');
  });
});

// ---------------------------------------------------------------------------
// mergeDuplicateCustomers (plan + apply)
// ---------------------------------------------------------------------------
describe('mergeDuplicateCustomers', () => {
  test('merges two rows: survivor updated, recipient re-pointed, duplicate deleted', async () => {
    const db = makeDb([
      row({
        id: 'p',
        email: 'juan@demo.com',
        createdAt: new Date('2022-01-01'),
        tags: ['vip'],
        notes: 'Cliente antiguo',
      }),
      row({
        id: 'd',
        email: 'JUAN@demo.com',
        createdAt: new Date('2024-01-01'),
        tags: ['nuevo'],
        notes: 'Llegó por Instagram',
        company: 'Barbería Demo',
      }),
    ]);

    const result = await mergeDuplicateCustomers('u1', ' juan@demo.com ', runDeps(db));

    assert.equal(result.merged, 1);
    assert.equal(result.primaryId, 'p');
    assert.deepEqual(db.deletes, [['d']]);
    assert.equal(db.store.length, 1);
    assert.equal(db.store[0].id, 'p');
    assert.deepEqual(db.store[0].tags, ['vip', 'nuevo']);
    assert.equal(db.store[0].notes, 'Cliente antiguo\n\nLlegó por Instagram');
    assert.equal(db.store[0].company, 'Barbería Demo');
    assert.equal(db.repoints[0].data.customerId, 'p');
  });

  test('normalizes the address when the user keeps the legacy row as survivor', async () => {
    const db = makeDb([
      row({ id: 'old', email: 'Juan@Demo.com', createdAt: new Date('2022-01-01'), name: 'Juan' }),
      row({ id: 'new', email: 'juan@demo.com', createdAt: new Date('2024-01-01'), company: 'Demo SL' }),
    ]);

    // The user's pick forces the loop ordering that used to hit the unique index.
    const result = await mergeDuplicateCustomers('u1', 'juan@demo.com', runDeps(db), {
      primaryId: 'old',
    });

    assert.equal(result.merged, 1);
    assert.equal(result.primaryId, 'old');
    assert.equal(db.store.length, 1);
    assert.equal(db.store[0].id, 'old');
    // Fields merged and the legacy spelling normalized afterwards.
    assert.equal(db.store[0].company, 'Demo SL');
    assert.equal(db.store[0].email, 'juan@demo.com');
  });

  test('normalizes a single padded row instead of leaving it to duplicate later', async () => {
    const db = makeDb([row({ id: 'only', email: ' Juan@Demo.com ' })]);
    const result = await mergeDuplicateCustomers('u1', 'juan@demo.com', runDeps(db));
    assert.equal(result.merged, 0);
    assert.equal(result.primaryId, 'only');
    assert.equal(db.store[0].email, 'juan@demo.com');
    assert.equal(db.deletes.length, 0);
  });

  test('does nothing when the contact is unknown', async () => {
    const db = makeDb([]);
    const result = await mergeDuplicateCustomers('u1', 'nadie@demo.com', runDeps(db));
    assert.deepEqual(result, { merged: 0, primaryId: null, email: 'nadie@demo.com' });
    assert.equal(db.updates.length, 0);
  });

  test('never throws, even when the database fails', async () => {
    const failing = {
      customer: {
        findMany: async () => {
          throw new Error('connection lost');
        },
      },
      campaignRecipient: { updateMany: async () => ({ count: 0 }) },
    };
    const result = await mergeDuplicateCustomers('u1', 'juan@demo.com', runDeps(failing));
    assert.deepEqual(result, { merged: 0, primaryId: null, email: 'juan@demo.com' });
  });

  test('sweep collapses every duplicated contact and is idempotent', async () => {
    const db = makeDb([
      row({ id: 'a1', email: 'juan@demo.com', createdAt: new Date('2022-01-01'), tags: ['vip'] }),
      row({ id: 'a2', email: 'JUAN@demo.com', createdAt: new Date('2024-01-01'), tags: ['nuevo'] }),
      row({ id: 'b1', email: 'ana@demo.com', createdAt: new Date('2023-01-01') }),
      row({ id: 'b2', email: ' ana@demo.com ', createdAt: new Date('2024-02-02') }),
      row({ id: 'c1', email: 'solo@demo.com' }),
      // Same address under a different owner: a different person, untouched.
      row({ id: 'a3', email: 'JUAN@demo.com', userId: 'u2' }),
    ]);

    const first = await sweepDuplicateCustomers(runDeps(db));
    assert.equal(first.contacts, 4);
    assert.equal(first.merged, 2);
    assert.equal(first.removed, 2);
    assert.equal(db.store.length, 4);
    assert.equal(db.store.filter((c) => c.userId === 'u2').length, 1);
    assert.deepEqual(
      db.store.find((c) => c.id === 'a1')!.tags,
      ['vip', 'nuevo']
    );

    const second = await sweepDuplicateCustomers(runDeps(db));
    assert.equal(second.merged, 0);
    assert.equal(second.removed, 0);
  });

  test('sweep never throws when the database fails', async () => {
    const failing = {
      customer: {
        findMany: async () => {
          throw new Error('connection lost');
        },
      },
      campaignRecipient: { updateMany: async () => ({ count: 0 }) },
    };
    assert.deepEqual(await sweepDuplicateCustomers(runDeps(failing)), {
      contacts: 0,
      merged: 0,
      removed: 0,
    });
  });

  test('finishes the merge even if re-pointing recipients fails', async () => {
    const db = makeDb([
      row({ id: 'p', email: 'juan@demo.com', createdAt: new Date('2022-01-01') }),
      row({ id: 'd', email: 'JUAN@demo.com', createdAt: new Date('2024-01-01') }),
    ]);
    db.campaignRecipient.updateMany = async () => {
      throw new Error('unique constraint');
    };
    const result = await mergeDuplicateCustomers('u1', 'juan@demo.com', runDeps(db));
    assert.equal(result.merged, 1);
    assert.equal(db.store.length, 1);
  });
});

// ---------------------------------------------------------------------------
// mergeContactIntoAddress (CRM email editor)
// ---------------------------------------------------------------------------
describe('mergeContactIntoAddress', () => {
  /** The row as the CRM would send it: new address + the user's fresh values. */
  const editedWithNewAddress = (stored: MergeableCustomer, over: Partial<MergeableCustomer> = {}) =>
    ({ ...stored, email: 'juan@demo.com', ...over });

  test('collapses the edited contact and the holder of the address', async () => {
    const stored = row({
      id: 'edit',
      email: 'viejo@demo.com',
      createdAt: new Date('2023-01-01'),
      tags: ['barberia'],
      notes: 'Le gusta por la tarde',
      phone: '+34 600 111 111',
    });
    const existing = row({
      id: 'ex',
      email: 'juan@demo.com',
      createdAt: new Date('2024-01-01'),
      name: 'Juan Viejo',
      company: 'Barbería Demo',
      tags: ['vip'],
      notes: 'Paga en efectivo',
      marketingOptOut: true,
    });
    const db = makeDb([stored, existing]);

    const result = await mergeContactIntoAddress(
      'u1',
      editedWithNewAddress(stored, { name: 'Juan Nuevo' }),
      'juan@demo.com',
      runDeps(db)
    );

    assert.equal(result.merged, 1);
    assert.equal(result.primaryId, 'edit', 'the row being edited keeps its identity');
    assert.equal(db.store.length, 1);
    const survivor = db.store[0];
    assert.equal(survivor.email, 'juan@demo.com', 'the new address is written');
    assert.equal(survivor.name, 'Juan Nuevo', 'the freshly typed value wins');
    assert.equal(survivor.company, 'Barbería Demo', 'the other card still contributes');
    assert.equal(survivor.phone, '+34 600 111 111');
    assert.deepEqual(survivor.tags, ['barberia', 'vip']);
    assert.equal(survivor.notes, 'Le gusta por la tarde\n\nPaga en efectivo');
    assert.equal(survivor.marketingOptOut, true);
  });

  test('keeps the existing contact when the user picks it as survivor', async () => {
    const stored = row({
      id: 'edit',
      email: 'viejo@demo.com',
      createdAt: new Date('2023-01-01'),
      name: 'Nombre Teclado',
      tags: ['nuevo'],
    });
    const existing = row({
      id: 'ex',
      email: 'juan@demo.com',
      createdAt: new Date('2022-06-06'),
      name: 'El Superviviente',
      notes: 'Histórico',
    });
    const db = makeDb([stored, existing]);

    const result = await mergeContactIntoAddress(
      'u1',
      editedWithNewAddress(stored),
      'juan@demo.com',
      runDeps(db),
      { primaryId: 'ex' }
    );

    assert.equal(result.primaryId, 'ex');
    assert.equal(db.store.length, 1);
    assert.equal(db.store[0].id, 'ex');
    assert.equal(db.store[0].email, 'juan@demo.com');
    assert.equal(db.store[0].name, 'El Superviviente');
    assert.deepEqual(db.store[0].tags, ['nuevo'], 'the edited card still contributes');
    assert.equal(db.store[0].notes, 'Histórico');
  });

  test('does nothing when nobody else holds the address', async () => {
    const stored = row({ id: 'solo', email: 'viejo@demo.com' });
    const db = makeDb([stored]);

    const result = await mergeContactIntoAddress(
      'u1',
      editedWithNewAddress(stored),
      'juan@demo.com',
      runDeps(db)
    );

    assert.deepEqual(result, { merged: 0, primaryId: 'solo', email: 'juan@demo.com' });
    assert.equal(db.store.length, 1, 'no write happens on the no-op path');
  });

  test('never throws when the database fails', async () => {
    const failing = {
      customer: {
        findMany: async () => {
          throw new Error('connection lost');
        },
      },
      campaignRecipient: { updateMany: async () => ({ count: 0 }) },
    };
    const result = await mergeContactIntoAddress(
      'u1',
      row({ id: 'edit', email: 'juan@demo.com' }),
      'juan@demo.com',
      runDeps(failing)
    );
    assert.deepEqual(result, { merged: 0, primaryId: null, email: 'juan@demo.com' });
  });
});

// ---------------------------------------------------------------------------
// Phone duplicates (advisory groups + manual merge)
// ---------------------------------------------------------------------------
describe('findPhoneDuplicateGroups', () => {
  test('groups contacts sharing a phone regardless of format', async () => {
    const db = makeDb([
      row({ id: 'a', email: 'ana@demo.com', phone: '+34 600 111 111', name: 'Ana' }),
      row({ id: 'b', email: 'ana2@demo.com', phone: '600-111-111', name: 'Ana 2' }),
      row({ id: 'c', email: 'otro@demo.com', phone: '+34 700 222 222' }),
    ]);
    const groups = await findPhoneDuplicateGroups('u1', runDeps(db));
    assert.equal(groups.length, 1);
    assert.equal(groups[0].email, '34600111111');
    assert.deepEqual(groups[0].contacts.map((c) => c.id), ['a', 'b']);
  });

  test('ignores cards without a phone and keeps email-only duplicates out', async () => {
    const db = makeDb([
      row({ id: 'a', email: 'ana@demo.com', phone: '+34 600 111 111' }),
      row({ id: 'b', email: 'ana@demo.com', phone: null }),
      row({ id: 'c', email: 'sin@demo.com', phone: null }),
    ]);
    const groups = await findPhoneDuplicateGroups('u1', runDeps(db));
    assert.equal(groups.length, 0, 'one phone + one phoneless card is not a phone duplicate');
  });
});

describe('mergePhoneDuplicates', () => {
  test('folds both cards into the chosen survivor keeping its own email', async () => {
    const db = makeDb([
      row({
        id: 'keep',
        email: 'ana@demo.com',
        phone: '+34 600 111 111',
        createdAt: new Date('2023-01-01'),
        name: 'Ana',
        tags: ['vip'],
      }),
      row({
        id: 'drop',
        email: 'ana-trabajo@demo.com',
        phone: '600-111-111',
        createdAt: new Date('2024-01-01'),
        company: 'Barbería Demo',
        tags: ['nuevo'],
        notes: 'Paga en efectivo',
      }),
    ]);

    const result = await mergePhoneDuplicates('u1', '+34 600 111 111', runDeps(db), {
      primaryId: 'keep',
    });

    assert.equal(result.merged, 1);
    assert.equal(result.primaryId, 'keep');
    assert.equal(result.email, 'ana@demo.com', 'the survivor keeps its own address');
    assert.equal(db.store.length, 1);
    const survivor = db.store[0];
    assert.equal(survivor.id, 'keep');
    assert.equal(survivor.email, 'ana@demo.com', 'the other card\'s address is NOT adopted');
    assert.equal(survivor.company, 'Barbería Demo');
    assert.deepEqual(survivor.tags, ['vip', 'nuevo']);
    assert.equal(survivor.notes, 'Paga en efectivo');
    assert.equal(survivor.phone, '+34 600 111 111', 'the survivor\'s own phone spelling stays');
  });

  test('falls back to the oldest card as survivor', async () => {
    const db = makeDb([
      row({ id: 'new', email: 'a@demo.com', phone: '600 111 111', createdAt: new Date('2024-06-01') }),
      row({ id: 'old', email: 'b@demo.com', phone: '+34600111111', createdAt: new Date('2022-02-02') }),
    ]);
    const result = await mergePhoneDuplicates('u1', '600-111-111', runDeps(db));
    assert.equal(result.primaryId, 'old');
    assert.equal(db.store.length, 1);
    assert.equal(db.store[0].id, 'old');
  });

  test('does nothing with fewer than two cards on the number', async () => {
    const db = makeDb([row({ id: 'solo', email: 'a@demo.com', phone: '+34 600 111 111' })]);
    const result = await mergePhoneDuplicates('u1', '600-111-111', runDeps(db));
    assert.equal(result.merged, 0);
    assert.equal(db.store.length, 1);
  });

  test('never throws when the database fails', async () => {
    const failing = {
      customer: {
        findMany: async () => {
          throw new Error('connection lost');
        },
      },
      campaignRecipient: { updateMany: async () => ({ count: 0 }) },
    };
    assert.deepEqual(await mergePhoneDuplicates('u1', '600111111', runDeps(failing)), {
      merged: 0,
      primaryId: null,
      email: null,
    });
  });
});

// ---------------------------------------------------------------------------
// Phone conflicts while saving a card by hand
// ---------------------------------------------------------------------------
describe('findContactsByPhone', () => {
  test('matches any spelling of the number and skips the edited card', async () => {
    const db = makeDb([
      row({ id: 'edit', email: 'a@demo.com', phone: '+34 600 111 111' }),
      row({ id: 'other', email: 'b@demo.com', phone: '600-111-111' }),
      row({ id: 'otro', email: 'c@demo.com', phone: '+34 700 000 000' }),
      row({ id: 'sin', email: 'd@demo.com', phone: null }),
    ]);

    const found = await findContactsByPhone('u1', '0034 600-111-111', runDeps(db), {
      excludeId: 'edit',
    });
    assert.deepEqual(found.map((r) => r.id), ['other']);
  });

  test('returns nothing for an empty phone', async () => {
    const db = makeDb([row({ id: 'a', phone: '600111111' })]);
    assert.deepEqual(await findContactsByPhone('u1', '   ', runDeps(db)), []);
  });
});

describe('mergeContactIntoPhone', () => {
  const cards = () => [
    row({
      id: 'edit',
      email: 'nuevo@demo.com',
      phone: null,
      name: 'Cliente Telefono',
      tags: ['nuevo'],
      createdAt: new Date('2023-01-01'),
    }),
    row({
      id: 'old',
      email: 'viejo@demo.com',
      phone: '+34 600 222 333',
      company: 'Peluquería Uno',
      tags: ['vip'],
      notes: 'Llegó por Instagram',
      createdAt: new Date('2022-01-01'),
    }),
  ];

  test('folds the stored card into the edited one, keeping what was typed', async () => {
    const db = makeDb(cards());
    const edited = { ...db.store[0], phone: '600-222-333' };

    const result = await mergeContactIntoPhone('u1', edited, '600-222-333', runDeps(db));

    assert.equal(result.merged, 1);
    assert.equal(result.primaryId, 'edit');
    assert.equal(db.store.length, 1);
    const survivor = db.store[0];
    assert.equal(survivor.id, 'edit');
    assert.equal(survivor.email, 'nuevo@demo.com', 'the edited card keeps its own address');
    assert.equal(survivor.phone, '600-222-333', 'the typed spelling is the one saved');
    assert.equal(survivor.company, 'Peluquería Uno', "the other card's data is adopted");
    assert.deepEqual(survivor.tags, ['nuevo', 'vip']);
    assert.equal(survivor.notes, 'Llegó por Instagram');
  });

  test('honours the card the user chose to keep', async () => {
    const db = makeDb(cards());
    const edited = { ...db.store[0], phone: '600-222-333' };

    const result = await mergeContactIntoPhone('u1', edited, '600-222-333', runDeps(db), {
      primaryId: 'old',
    });

    assert.equal(result.primaryId, 'old');
    assert.equal(result.email, 'viejo@demo.com');
    assert.equal(db.store.length, 1);
    assert.equal(db.store[0].id, 'old');
    assert.equal(db.store[0].name, 'Cliente Telefono', 'the edited values are still kept');
    assert.deepEqual(db.store[0].tags, ['vip', 'nuevo']);
  });

  test('does nothing when no other card holds the number', async () => {
    const db = makeDb([row({ id: 'solo', email: 'a@demo.com', phone: null })]);
    const edited = { ...db.store[0], phone: '600-222-333' };
    const result = await mergeContactIntoPhone('u1', edited, '600-222-333', runDeps(db));
    assert.deepEqual(result, { merged: 0, primaryId: 'solo', email: null });
    assert.equal(db.store.length, 1);
  });

  test('never throws when the database fails', async () => {
    const failing = {
      customer: {
        findMany: async () => {
          throw new Error('connection lost');
        },
      },
      campaignRecipient: { updateMany: async () => ({ count: 0 }) },
    };
    assert.deepEqual(
      await mergeContactIntoPhone('u1', row({ id: 'edit' }), '600222333', runDeps(failing)),
      { merged: 0, primaryId: null, email: null }
    );
  });
});

describe('adoptDraftIntoContact', () => {
  const stored = () =>
    row({
      id: 'card',
      email: 'ana@demo.com',
      name: 'Ana',
      company: null,
      phone: null,
      tags: ['vip'],
      notes: 'Prefiere por las tardes',
      marketingOptOut: true,
      createdAt: new Date('2022-05-05'),
    });

  test('adds the typed values, unions tags/notes and keeps the stored identity', async () => {
    const db = makeDb([stored()]);

    const updated = await adoptDraftIntoContact(
      'u1',
      db.store[0],
      {
        name: 'Ana López',
        company: 'Barbería Demo',
        phone: '600 111 111',
        notes: 'Vino por Instagram',
        tags: ['Nuevo', 'nuevo'],
      },
      runDeps(db)
    );

    assert.equal(updated?.id, 'card');
    const card = db.store[0];
    assert.equal(card.email, 'ana@demo.com', 'the address its history hangs on is untouched');
    assert.equal(card.name, 'Ana López');
    assert.equal(card.company, 'Barbería Demo');
    assert.equal(card.phone, '600 111 111');
    assert.deepEqual(card.tags, ['nuevo', 'vip'], 'typed tags go first, duplicates dropped');
    assert.equal(card.notes, 'Vino por Instagram\n\nPrefiere por las tardes');
    assert.equal(card.marketingOptOut, true, 'the opt-out survives');
    assert.equal(card.createdAt.getTime(), new Date('2022-05-05').getTime());
  });

  test('a blank draft keeps whatever the card already had', async () => {
    const db = makeDb([stored()]);
    await adoptDraftIntoContact(
      'u1',
      db.store[0],
      { name: '   ', company: null, phone: null, notes: '', tags: [] },
      runDeps(db)
    );
    assert.equal(db.store[0].name, 'Ana');
    assert.equal(db.store[0].notes, 'Prefiere por las tardes');
    assert.deepEqual(db.store[0].tags, ['vip']);
  });

  test('never throws when the database fails', async () => {
    const failing = {
      customer: {
        update: async () => {
          throw new Error('connection lost');
        },
      },
      campaignRecipient: { updateMany: async () => ({ count: 0 }) },
    };
    assert.equal(await adoptDraftIntoContact('u1', row({ id: 'card' }), { name: 'X' }, runDeps(failing)), null);
  });
});
