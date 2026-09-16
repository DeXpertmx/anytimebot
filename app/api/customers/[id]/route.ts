import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { deleteObject } from '@/lib/storage';
import { storageKeyFromUrl } from '@/lib/storage-url';
import {
  describeCustomerMerge,
  mergeContactIntoAddress,
  normalizeEmail,
  EMAIL_ALREADY_EXISTS,
  type EmailConflictContactPayload,
  type EmailConflictPayload,
  type MergeableCustomer,
} from '@/lib/crm-merge';

export const dynamic = 'force-dynamic';

async function getOwnedCustomer(id: string, userId: string) {
  const customer = await prisma.customer.findUnique({ where: { id } });
  return customer && customer.userId === userId ? customer : null;
}

/** Deletes the uploaded photo file of a customer (best effort). */
async function deleteCustomerPhoto(photo: string | null | undefined) {
  const key = storageKeyFromUrl(photo || '');
  if (key) {
    await deleteObject(key).catch(() => undefined);
  }
}

/**
 * One side of an email conflict, ready for the CRM dialog: the contact fields
 * plus the booking history of the address that card currently holds (bookings
 * link to the CRM by guest email), so the owner can see which one has the
 * history behind it.
 *
 * `shownEmail` may differ from `historyEmail`: the card being edited shows the
 * address the user just typed while its history still sits on the old one.
 */
async function conflictContact(
  row: MergeableCustomer,
  shownEmail: string,
  historyEmail: string
): Promise<EmailConflictContactPayload> {
  const where = {
    eventType: { bookingPage: { userId: row.userId } },
    guestEmail: { equals: historyEmail, mode: 'insensitive' as const },
  };
  const [totalBookings, last] = await Promise.all([
    prisma.booking.count({ where }),
    prisma.booking.findFirst({
      where,
      orderBy: { startTime: 'desc' },
      select: { startTime: true },
    }),
  ]);

  return {
    id: row.id,
    email: shownEmail,
    name: row.name,
    company: row.company,
    phone: row.phone,
    photo: row.photo,
    notes: row.notes,
    tags: row.tags,
    marketingOptOut: row.marketingOptOut,
    createdAt: row.createdAt.toISOString(),
    historyEmail,
    totalBookings,
    lastBookingAt: last?.startTime?.toISOString() ?? null,
  };
}

// PATCH /api/customers/[id] - update notes, tags, name, email, company or phone
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const userId = (session.user as any).id;
    const owned = await getOwnedCustomer(params.id, userId);
    if (!owned) {
      return NextResponse.json({ success: false, error: 'Customer not found' }, { status: 404 });
    }

    const body = await request.json();
    const data: any = {};

    if (typeof body.name === 'string') data.name = body.name.trim() || null;
    if (typeof body.company === 'string') data.company = body.company.trim() || null;
    if (typeof body.phone === 'string') data.phone = body.phone.trim() || null;
    // Photo: empty string removes it; replacing or removing deletes the old file
    // (only after the write below succeeds, so a failed request never leaves the
    // card pointing at a deleted file).
    let photoChanged = false;
    if (typeof body.photo === 'string') {
      const trimmed = body.photo.trim();
      const next = trimmed || null;
      photoChanged = next !== owned.photo;
      data.photo = next;
    }
    if (typeof body.notes === 'string') data.notes = body.notes.trim() || null;
    if (Array.isArray(body.tags)) {
      const tags = [
        ...new Set(
          body.tags
            .filter((tag: unknown) => typeof tag === 'string' && tag.trim())
            .map((tag: string) => tag.trim().toLowerCase())
            .slice(0, 20)
        ),
      ];
      data.tags = tags;
    }

    // Email change: validate the format and resolve the collision with another
    // contact. Email is the contact's identity anchor (booking stats, history),
    // so it cannot be emptied, and writing an address another card already owns
    // is exactly the moment to merge both cards into one instead of failing.
    if (typeof body.email === 'string') {
      const email = normalizeEmail(body.email);
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return NextResponse.json(
          { success: false, error: 'Invalid email address' },
          { status: 400 }
        );
      }

      if (email !== normalizeEmail(owned.email)) {
        // `contains` narrows indexed rows cheaply; the exact comparison happens
        // in JS, so a mixed-case or padded spelling still counts as a clash.
        const clashes = (
          await prisma.customer.findMany({
            where: {
              userId,
              id: { not: params.id },
              email: { contains: email, mode: 'insensitive' },
            },
          })
        ).filter((row) => normalizeEmail(row.email) === email);

        if (clashes.length > 0) {
          // The card as it will look after saving: new address plus every field
          // the user just edited, so its values are the ones that win.
          const patched: MergeableCustomer = { ...owned, ...data, email };
          const group: MergeableCustomer[] = [patched, ...clashes];
          const allowed = new Set(group.map((row) => row.id));
          const choice = typeof body.primaryId === 'string' ? body.primaryId : null;
          if (choice && !allowed.has(choice)) {
            return NextResponse.json(
              { success: false, error: 'Contact not found in this merge group' },
              { status: 400 }
            );
          }
          // Default survivor: the card being edited (it holds the new values).
          const preferred = choice ?? params.id;

          // Dry run: no write happens until the owner confirms the merge, so the
          // dialog can show what each card contributes and who keeps identity.
          if (body.mergeOnConflict !== true) {
            // The group always has 2+ cards on this address, so a preview exists.
            const preview = describeCustomerMerge(group, email, preferred);
            if (!preview) {
              return NextResponse.json(
                { success: false, error: 'Internal server error' },
                { status: 500 }
              );
            }

            const conflict: EmailConflictPayload = {
              email,
              contacts: await Promise.all([
                conflictContact(patched, email, normalizeEmail(owned.email)),
                ...clashes.map((row) => conflictContact(row, row.email, normalizeEmail(row.email))),
              ]),
              suggestedPrimaryId: params.id,
              preview: { ...preview, createdAt: preview.createdAt.toISOString() },
            };

            return NextResponse.json(
              { success: false, error: EMAIL_ALREADY_EXISTS, conflict },
              { status: 409 }
            );
          }

          const result = await mergeContactIntoAddress(userId, patched, email, { prisma }, {
            primaryId: preferred,
          });
          if (result.merged === 0 || !result.primaryId) {
            return NextResponse.json(
              { success: false, error: 'Internal server error' },
              { status: 500 }
            );
          }

          const customer = await prisma.customer.findUnique({ where: { id: result.primaryId } });
          // The merged card may have adopted the other photo: the file of the
          // one that lost is deleted, never the one still in use.
          if (owned.photo && owned.photo !== customer?.photo) {
            await deleteCustomerPhoto(owned.photo);
          }

          console.info(
            `CRM merge: owner ${userId} merged ${result.merged} card(s) into ${result.primaryId} after the email was changed to ${email}`
          );

          return NextResponse.json({ success: true, data: { ...result, customer } });
        }

        data.email = email;
      }
    }

    const customer = await prisma.customer.update({
      where: { id: params.id },
      data,
    });

    if (photoChanged) {
      await deleteCustomerPhoto(owned.photo);
    }

    return NextResponse.json({ success: true, data: customer });
  } catch (error) {
    console.error('Error updating customer:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE /api/customers/[id] - forget a contact (bookings are kept)
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const userId = (session.user as any).id;
    const owned = await getOwnedCustomer(params.id, userId);
    if (!owned) {
      return NextResponse.json({ success: false, error: 'Customer not found' }, { status: 404 });
    }

    await prisma.customer.delete({ where: { id: params.id } });
    await deleteCustomerPhoto(owned.photo);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting customer:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
