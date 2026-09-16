/**
 * CRM duplicate merge (lib/crm-merge.ts).
 *
 * A CRM contact is keyed by (ownerId, email) and every booking links to the
 * CRM by guest email, so two rows for the same address split a contact in two:
 * tags and notes live on different rows and the dashboard shows the booking
 * history twice under two cards. Legacy mixed-case / padded emails (imports,
 * records written before emails were normalized) are the usual cause.
 *
 * Whenever a booking arrives we collapse those rows into the survivor, keeping
 * the richest data available: tags are unioned, notes are concatenated (nothing
 * is dropped), missing company/phone/photo are adopted from the duplicates and
 * the earliest createdAt is kept so the contact keeps its original age. Rows
 * that referenced a duplicate (marketing campaign recipients) are re-pointed to
 * the survivor, so the full history stays attached.
 *
 * Planning is pure and applying is dependency-injected, so node:test drives it
 * without a database.
 */
import type { PrismaClient, Customer } from '@prisma/client';
import { prisma } from './db';

/** Contact fields the merge reasons about (a Customer row, structurally). */
export type MergeableCustomer = Pick<
  Customer,
  | 'id'
  | 'userId'
  | 'email'
  | 'name'
  | 'company'
  | 'phone'
  | 'photo'
  | 'notes'
  | 'tags'
  | 'marketingOptOut'
  | 'createdAt'
>;

export interface MergePlan {
  /** Row that survives (oldest, richest is preferred over the others). */
  primaryId: string;
  /** Rows removed after their data is folded into the primary. */
  duplicateIds: string[];
  /** Field values to write on the primary (email always normalized). */
  merged: {
    email: string;
    name: string | null;
    company: string | null;
    phone: string | null;
    photo: string | null;
    notes: string | null;
    tags: string[];
    marketingOptOut: boolean;
    createdAt: Date;
  };
}

export interface CrmMergeResult {
  /** Number of duplicate rows removed (0 = nothing to do). */
  merged: number;
  /** Surviving contact, when there was one. */
  primaryId: string | null;
  /** Normalized email the merge ran for. */
  email: string | null;
}

export interface CrmMergeDeps {
  prisma: Pick<PrismaClient, 'customer' | 'campaignRecipient'>;
}

/**
 * Identity anchor of a CRM contact: emails are stored trimmed and lowercased so
 * `Juan@Demo.com` and ` juan@demo.com ` are the same person.
 */
export function normalizeEmail(email: string | null | undefined): string {
  return (email || '').trim().toLowerCase();
}

const meaningful = (value: string | null | undefined): value is string =>
  typeof value === 'string' && value.trim().length > 0;

/** Oldest first, id as a tiebreaker so the pick is deterministic in tests. */
function byAge(a: MergeableCustomer, b: MergeableCustomer): number {
  const diff = a.createdAt.getTime() - b.createdAt.getTime();
  return diff !== 0 ? diff : a.id.localeCompare(b.id);
}

/** Join distinct notes with a blank line, primary first (nothing is lost). */
export function mergeNotes(primary: string | null, others: (string | null)[]): string | null {
  const chunks: string[] = [];
  for (const note of [primary, ...others]) {
    const trimmed = meaningful(note) ? note.trim() : '';
    if (trimmed && !chunks.includes(trimmed)) chunks.push(trimmed);
  }
  return chunks.length > 0 ? chunks.join('\n\n') : null;
}

/**
 * Plan the merge of every row that belongs to `normalizedEmail`.
 *
 * Rows already on the normalized address win the primary spot; otherwise the
 * oldest row does (so the contact keeps the age and history it earned first).
 * Returns null when there is nothing to merge.
 */
export function planCustomerMerge(
  rows: MergeableCustomer[],
  normalizedEmail: string
): MergePlan | null {
  const email = normalizeEmail(normalizedEmail);
  if (!email) return null;

  const relevant = rows.filter((row) => normalizeEmail(row.email) === email);
  if (relevant.length === 0) return null;

  const exact = relevant.filter((row) => row.email === email).sort(byAge);
  const primary = exact.length > 0 ? exact[0] : [...relevant].sort(byAge)[0];
  const duplicates = relevant.filter((row) => row.id !== primary.id).sort(byAge);

  // Duplicates are read oldest-first so the oldest value becomes the fallback
  // whenever the survivor has nothing to offer.
  const firstMeaningful = (pick: (row: MergeableCustomer) => string | null) =>
    [primary, ...duplicates].map(pick).find(meaningful)?.trim() ?? null;

  const tags: string[] = [];
  for (const row of [primary, ...duplicates]) {
    for (const tag of row.tags || []) {
      const value = tag.trim().toLowerCase();
      if (value && !tags.includes(value)) tags.push(value);
    }
  }

  const createdAt = [primary, ...duplicates].sort(byAge)[0].createdAt;

  return {
    primaryId: primary.id,
    duplicateIds: duplicates.map((row) => row.id),
    merged: {
      email,
      name: firstMeaningful((row) => row.name),
      company: firstMeaningful((row) => row.company),
      phone: firstMeaningful((row) => row.phone),
      photo: firstMeaningful((row) => row.photo),
      notes: mergeNotes(primary.notes, duplicates.map((row) => row.notes)),
      tags,
      // Opt-out survives the merge: dropping it would email someone who asked
      // not to be contacted (RGPD).
      marketingOptOut: [primary, ...duplicates].some((row) => row.marketingOptOut),
      createdAt,
    },
  };
}

/**
 * Collapse the duplicate CRM contacts of `email` for one owner, keeping every
 * piece of data and re-pointing related records to the survivor. Never throws:
 * a CRM tidy-up must not break booking creation.
 */
export async function mergeDuplicateCustomers(
  ownerId: string,
  email: string | null | undefined,
  deps: CrmMergeDeps = { prisma }
): Promise<CrmMergeResult> {
  const normalized = normalizeEmail(email);
  if (!ownerId || !normalized) return { merged: 0, primaryId: null, email: null };

  try {
    // `contains` narrows indexed rows cheaply (it also catches padded emails
    // that `equals` would miss); the exact comparison happens in JS below.
    const candidates = await deps.prisma.customer.findMany({
      where: {
        userId: ownerId,
        email: { contains: normalized, mode: 'insensitive' },
      },
    });

    const rows = candidates.filter((row) => normalizeEmail(row.email) === normalized);
    if (rows.length === 0) return { merged: 0, primaryId: null, email: normalized };

    // Single row: still normalize the stored address (a padded/mixed-case row
    // would otherwise spawn a second contact on the next exact-match upsert).
    if (rows.length === 1) {
      const only = rows[0];
      if (only.email !== normalized) {
        await deps.prisma.customer.update({
          where: { id: only.id },
          data: { email: normalized },
        });
      }
      return { merged: 0, primaryId: only.id, email: normalized };
    }

    const plan = planCustomerMerge(rows, normalized);
    if (!plan || plan.duplicateIds.length === 0) {
      return { merged: 0, primaryId: plan?.primaryId ?? null, email: normalized };
    }

    await deps.prisma.customer.update({
      where: { id: plan.primaryId },
      data: plan.merged,
    });

    // Related records follow the survivor. Isolated in its own try/catch so a
    // constraint clash (duplicate recipient row in the same campaign) can never
    // abort the merge and leave the CRM half-merged.
    try {
      await deps.prisma.campaignRecipient.updateMany({
        where: { customerId: { in: plan.duplicateIds } },
        data: { customerId: plan.primaryId },
      });
    } catch (error) {
      console.error('CRM merge: could not re-point campaign recipients:', error);
    }

    await deps.prisma.customer.deleteMany({
      where: { userId: ownerId, id: { in: plan.duplicateIds } },
    });

    return {
      merged: plan.duplicateIds.length,
      primaryId: plan.primaryId,
      email: normalized,
    };
  } catch (error) {
    console.error('CRM duplicate merge failed:', error);
    return { merged: 0, primaryId: null, email: normalized };
  }
}

export interface CrmSweepResult {
  /** (owner, email) keys examined. */
  contacts: number;
  /** Keys that had more than one row or an unnormalized address. */
  merged: number;
  /** Duplicate rows removed in total. */
  removed: number;
}

/**
 * One-shot tidy-up of contacts that are already duplicated in the database
 * (legacy rows created before emails were normalized). Booking-time merging
 * only heals a contact when that person books again, so this sweep is what
 * fixes the data that is duplicated right now — idempotent and safe to re-run
 * (a second pass finds nothing to merge).
 *
 * Grouping happens in JS because the SQL index is on the raw address, so
 * `Juan@Demo.com` and `juan@demo.com` are separate groups for the database.
 */
export async function sweepDuplicateCustomers(
  deps: CrmMergeDeps = { prisma }
): Promise<CrmSweepResult> {
  try {
    const rows = await deps.prisma.customer.findMany({
      select: { userId: true, email: true },
    });

    const counts = new Map<
      string,
      { ownerId: string; email: string; count: number; unnormalized: boolean }
    >();
    for (const row of rows) {
      const email = normalizeEmail(row.email);
      if (!email) continue;
      const key = `${row.userId}::${email}`;
      const entry = counts.get(key);
      if (entry) {
        entry.count += 1;
        entry.unnormalized = entry.unnormalized || row.email !== email;
      } else {
        counts.set(key, {
          ownerId: row.userId,
          email,
          count: 1,
          unnormalized: row.email !== email,
        });
      }
    }

    const result: CrmSweepResult = { contacts: counts.size, merged: 0, removed: 0 };
    for (const entry of counts.values()) {
      // Nothing to do for a lone, already-normalized row.
      if (entry.count < 2 && !entry.unnormalized) continue;
      const outcome = await mergeDuplicateCustomers(entry.ownerId, entry.email, deps);
      if (outcome.merged > 0) {
        result.merged += 1;
        result.removed += outcome.merged;
      }
    }
    return result;
  } catch (error) {
    console.error('CRM duplicate sweep failed:', error);
    return { contacts: 0, merged: 0, removed: 0 };
  }
}
