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
 * The same engine powers the CRM email editor: re-pointing a contact to an
 * address another contact already owns merges both cards instead of failing.
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

/** Fields shown (with provenance) in the merge preview. */
export type MergeFieldKey = 'name' | 'company' | 'phone' | 'photo';

/**
 * Human-readable preview of a merge: which contact every kept value comes from,
 * which tags survive and which notes are kept. Drives the CRM dialog, so the
 * user sees what is preserved before confirming.
 */
export interface MergePreview {
  email: string;
  primaryId: string;
  duplicateIds: string[];
  /** Merged value + the contact it was taken from (null = empty in all rows). */
  fields: Record<MergeFieldKey, { value: string | null; fromId: string | null }>;
  /** Tags of the result, each with the contacts that contributed it. */
  tags: { tag: string; fromIds: string[] }[];
  /** Notes kept, in order, with their original contact. */
  notes: { text: string; fromId: string }[];
  /** Oldest createdAt of the group (what the result will keep). */
  createdAt: Date;
  /** True when any row had opted out (the result stays opted out). */
  marketingOptOut: boolean;
}

/**
 * Build the merge preview (provenance included) for one email out of its rows.
 * Pure: no database, no writes.
 */
export function describeCustomerMerge(
  rows: MergeableCustomer[],
  normalizedEmail: string,
  preferredPrimaryId?: string | null
): MergePreview | null {
  const plan = planCustomerMerge(rows, normalizedEmail, preferredPrimaryId);
  if (!plan) return null;

  const primary = rows.find((row) => row.id === plan.primaryId)!;
  const ordered = [primary, ...plan.duplicateIds.map((id) => rows.find((r) => r.id === id)!)].filter(
    Boolean
  ) as MergeableCustomer[];

  const sourceOf = (pick: (row: MergeableCustomer) => string | null, value: string | null) =>
    value === null ? null : ordered.find((row) => pick(row)?.trim() === value)?.id ?? null;

  const fields = {} as MergePreview['fields'];
  for (const key of ['name', 'company', 'phone', 'photo'] as MergeFieldKey[]) {
    const pick = (row: MergeableCustomer) => row[key];
    fields[key] = { value: plan.merged[key], fromId: sourceOf(pick, plan.merged[key]) };
  }

  const tags = plan.merged.tags.map((tag) => ({
    tag,
    fromIds: ordered
      .filter((row) => (row.tags || []).some((item) => item.trim().toLowerCase() === tag))
      .map((row) => row.id),
  }));

  const notes: MergePreview['notes'] = [];
  for (const row of ordered) {
    const text = row.notes?.trim();
    if (text && !notes.some((note) => note.text === text)) {
      notes.push({ text, fromId: row.id });
    }
  }

  return {
    email: plan.merged.email,
    primaryId: plan.primaryId,
    duplicateIds: plan.duplicateIds,
    fields,
    tags,
    notes,
    createdAt: plan.merged.createdAt,
    marketingOptOut: plan.merged.marketingOptOut,
  };
}

export interface CrmMergeDeps {
  prisma: Pick<PrismaClient, 'customer' | 'campaignRecipient'>;
}

/**
 * Machine-readable code sent with the 409 when an email edit collides with
 * another contact: the CRM editor uses it to offer merging both cards. Clients
 * that do not know about merging keep seeing a plain conflict.
 */
export const EMAIL_ALREADY_EXISTS = 'EMAIL_ALREADY_EXISTS';

/** A `MergePreview` as it crosses the API boundary (dates serialized). */
export type MergePreviewPayload = Omit<MergePreview, 'createdAt'> & { createdAt: string };

/**
 * One side of an email conflict, as the API sends it to the CRM dialog.
 *
 * `email` is the address the card shows (on the card being edited that is the
 * one the user just typed) while `historyEmail` is the address whose bookings
 * it currently carries — the two differ while an email change is pending.
 */
export interface EmailConflictContactPayload {
  id: string;
  email: string;
  name: string | null;
  company: string | null;
  phone: string | null;
  photo: string | null;
  notes: string | null;
  tags: string[];
  marketingOptOut: boolean;
  createdAt: string;
  historyEmail: string;
  totalBookings: number;
  lastBookingAt: string | null;
}

/**
 * Body of the 409 the CRM receives when the email being saved already belongs
 * to another contact: both cards plus what merging them would keep.
 */
export interface EmailConflictPayload {
  email: string;
  contacts: EmailConflictContactPayload[];
  suggestedPrimaryId: string;
  preview: MergePreviewPayload;
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
 * `preferredPrimaryId` (what the user picked in the CRM) wins when it is part
 * of the group; otherwise rows already on the normalized address take the
 * primary spot, and failing that the oldest row does — so the contact keeps
 * the age and history it earned first. Returns null when there is nothing to
 * merge.
 */
export function planCustomerMerge(
  rows: MergeableCustomer[],
  normalizedEmail: string,
  preferredPrimaryId?: string | null
): MergePlan | null {
  const email = normalizeEmail(normalizedEmail);
  if (!email) return null;

  const relevant = rows.filter((row) => normalizeEmail(row.email) === email);
  if (relevant.length === 0) return null;

  const preferred = preferredPrimaryId
    ? relevant.find((row) => row.id === preferredPrimaryId)
    : undefined;
  const exact = relevant.filter((row) => row.email === email).sort(byAge);
  const primary =
    preferred ?? (exact.length > 0 ? exact[0] : [...relevant].sort(byAge)[0]);
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
 * Collapse a known set of contacts that are supposed to be the same person.
 * Callers hand over the rows (already scoped to the owner) because the group is
 * not always derivable from a stored address: when the CRM user re-points a
 * contact to an address another contact already owns, the edited row still has
 * its previous address in the database (see `mergeContactIntoAddress`).
 *
 * Never throws: a CRM tidy-up must not break booking creation.
 */
export async function mergeCustomerRows(
  ownerId: string,
  normalizedEmail: string,
  rows: MergeableCustomer[],
  deps: CrmMergeDeps = { prisma },
  options: { primaryId?: string | null } = {}
): Promise<CrmMergeResult> {
  const normalized = normalizeEmail(normalizedEmail);
  if (!ownerId || !normalized) return { merged: 0, primaryId: null, email: null };

  try {
    const relevant = rows.filter((row) => normalizeEmail(row.email) === normalized);
    if (relevant.length === 0) return { merged: 0, primaryId: null, email: normalized };

    // Single row: still normalize the stored address (a padded/mixed-case row
    // would otherwise spawn a second contact on the next exact-match upsert).
    if (relevant.length === 1) {
      const only = relevant[0];
      if (only.email !== normalized) {
        await deps.prisma.customer.update({
          where: { id: only.id },
          data: { email: normalized },
        });
      }
      return { merged: 0, primaryId: only.id, email: normalized };
    }

    const plan = planCustomerMerge(relevant, normalized, options.primaryId);
    if (!plan || plan.duplicateIds.length === 0) {
      return { merged: 0, primaryId: plan?.primaryId ?? null, email: normalized };
    }

    // Order matters. The survivor can be a row with the legacy spelling (the
    // CRM lets the user choose it), and in that case another row may still hold
    // the normalized address: normalizing the survivor in the same write would
    // hit the (user_id, email) unique index. So the fields go first, then the
    // duplicates disappear, and only then the address is written.
    const { email: mergedEmail, ...mergedFields } = plan.merged;
    await deps.prisma.customer.update({
      where: { id: plan.primaryId },
      data: mergedFields,
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

    // Unconditional: by now the group freed the address (every row holding it
    // was either the survivor or a duplicate just deleted), and the survivor is
    // the only row left that must carry the normalized spelling. It is also
    // what makes an email change stick when the survivor is the edited row.
    await deps.prisma.customer.update({
      where: { id: plan.primaryId },
      data: { email: mergedEmail },
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

/**
 * Collapse the duplicate CRM contacts of `email` for one owner, keeping every
 * piece of data and re-pointing related records to the survivor. This is the
 * booking-time / sweep entry point, where the group is simply "every row on
 * that address".
 */
export async function mergeDuplicateCustomers(
  ownerId: string,
  email: string | null | undefined,
  deps: CrmMergeDeps = { prisma },
  options: { primaryId?: string | null } = {}
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

    return await mergeCustomerRows(ownerId, normalized, candidates, deps, options);
  } catch (error) {
    console.error('CRM duplicate merge failed:', error);
    return { merged: 0, primaryId: null, email: normalized };
  }
}

/**
 * Merge a contact that is being re-pointed to an address another contact of the
 * same owner already holds (the CRM email editor, where a plain save used to be
 * rejected with a 409).
 *
 * `edited` is the row as it will look after the edit — new address and pending
 * field changes included — so the values the user just typed are the ones that
 * win; the stored rows on that address are folded in as duplicates. Every row
 * of the group is considered (there may be more than one), and the group's
 * address is free by the time it is written.
 */
export async function mergeContactIntoAddress(
  ownerId: string,
  edited: MergeableCustomer,
  email: string | null | undefined,
  deps: CrmMergeDeps = { prisma },
  options: { primaryId?: string | null } = {}
): Promise<CrmMergeResult> {
  const normalized = normalizeEmail(email);
  if (!ownerId || !normalized || !edited?.id) {
    return { merged: 0, primaryId: edited?.id ?? null, email: normalized || null };
  }

  try {
    const candidates = await deps.prisma.customer.findMany({
      where: {
        userId: ownerId,
        id: { not: edited.id },
        email: { contains: normalized, mode: 'insensitive' },
      },
    });
    const others = candidates.filter((row) => normalizeEmail(row.email) === normalized);
    if (others.length === 0) {
      return { merged: 0, primaryId: edited.id, email: normalized };
    }

    const group: MergeableCustomer[] = [{ ...edited, email: normalized }, ...others];
    return await mergeCustomerRows(ownerId, normalized, group, deps, {
      primaryId: options.primaryId ?? edited.id,
    });
  } catch (error) {
    console.error('CRM email change merge failed:', error);
    return { merged: 0, primaryId: null, email: normalized };
  }
}

/**
 * Duplicate groups of one owner, ready for the CRM dialog: every contact of
 * the address plus the preview of what merging them keeps.
 */
export interface DuplicateGroup {
  email: string;
  contacts: MergeableCustomer[];
  preview: MergePreview;
}

/**
 * Find the contacts that are duplicated per email for one owner. Grouping
 * happens in JS because the SQL index is on the raw address, so
 * `Juan@Demo.com` and `juan@demo.com` are separate groups for the database.
 */
export async function findDuplicateGroups(
  userId: string,
  deps: CrmMergeDeps = { prisma }
): Promise<DuplicateGroup[]> {
  const rows = await deps.prisma.customer.findMany({
    where: { userId },
    orderBy: { createdAt: 'asc' },
  });

  const byEmail = new Map<string, MergeableCustomer[]>();
  for (const row of rows) {
    const email = normalizeEmail(row.email);
    if (!email) continue;
    const group = byEmail.get(email);
    if (group) group.push(row);
    else byEmail.set(email, [row]);
  }

  const groups: DuplicateGroup[] = [];
  for (const [email, contacts] of byEmail) {
    if (contacts.length < 2) continue;
    const preview = describeCustomerMerge(contacts, email);
    if (!preview) continue;
    groups.push({ email, contacts, preview });
  }

  // Oldest groups first: those are the ones that have been split the longest.
  return groups.sort((a, b) => a.preview.createdAt.getTime() - b.preview.createdAt.getTime());
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
