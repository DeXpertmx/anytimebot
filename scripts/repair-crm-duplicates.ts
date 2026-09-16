/**
 * One-time (idempotent) CRM tidy-up: merge the contacts that are already
 * duplicated per email.
 *
 *   npx tsx scripts/repair-crm-duplicates.ts --dry-run   # report only
 *   npx tsx scripts/repair-crm-duplicates.ts             # merge for real
 *
 * Booking-time merging (lib/crm.ts) heals a contact only when that person books
 * again, so this sweep is what fixes duplicated data right now. It keeps the
 * richest row: tags unioned, notes concatenated, missing company/phone/photo
 * adopted, opt-out preserved and campaign history re-pointed to the survivor.
 * Safe to re-run — a second pass finds nothing.
 *
 * Requires .env.local with the production DATABASE_URL.
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { PrismaClient } from '@prisma/client';
import { normalizeEmail } from '../lib/crm-merge';

const prisma = new PrismaClient();
const DRY_RUN = process.argv.includes('--dry-run');

/** Shape the sweep needs (kept local so the dry-run skips the merge import path). */
interface DuplicateGroup {
  ownerId: string;
  email: string;
  rows: { id: string; email: string; createdAt: Date; tags: string[] }[];
}

async function findDuplicates(): Promise<DuplicateGroup[]> {
  const rows = await prisma.customer.findMany({
    select: { id: true, userId: true, email: true, createdAt: true, tags: true },
    orderBy: { createdAt: 'asc' },
  });

  const groups = new Map<string, DuplicateGroup>();
  for (const row of rows) {
    const email = normalizeEmail(row.email);
    if (!email) continue;
    const key = `${row.userId}::${email}`;
    const group = groups.get(key);
    if (group) group.rows.push(row);
    else groups.set(key, { ownerId: row.userId, email, rows: [row] });
  }

  return Array.from(groups.values()).filter(
    (group) => group.rows.length > 1 || group.rows.some((row) => row.email !== group.email)
  );
}

async function main(): Promise<void> {
  const duplicates = await findDuplicates();

  console.log(
    `CRM contacts with duplicates or unnormalized emails: ${duplicates.length}`
  );
  for (const group of duplicates) {
    const tags = Array.from(new Set(group.rows.flatMap((row) => row.tags))).join(', ');
    console.log(
      `  • ${group.email} (owner ${group.ownerId}) → ${group.rows.length} rows` +
        (tags ? ` · tags: ${tags}` : '')
    );
  }

  if (duplicates.length === 0) {
    console.log('Nothing to merge.');
    return;
  }

  if (DRY_RUN) {
    console.log('\nDry run: no changes written. Re-run without --dry-run to merge.');
    return;
  }

  const { sweepDuplicateCustomers } = await import('../lib/crm-merge');
  const before = await prisma.customer.count();
  const result = await sweepDuplicateCustomers({ prisma });
  const after = await prisma.customer.count();

  console.log(
    `\nMerged ${result.merged} contact(s), removed ${result.removed} duplicate row(s).`
  );
  console.log(`CRM rows: ${before} → ${after}`);
}

main()
  .catch((error) => {
    console.error('CRM duplicate repair failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
