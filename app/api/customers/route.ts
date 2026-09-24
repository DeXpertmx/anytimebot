import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import {
  adoptDraftIntoContact,
  findContactsByPhone,
  normalizeEmail,
  EMAIL_ALREADY_EXISTS,
  PHONE_ALREADY_EXISTS,
  type ContactDraft,
  type CreateConflictPayload,
} from '@/lib/crm-merge';
import { buildConflictContact } from '@/lib/crm-conflict';

export const dynamic = 'force-dynamic';

// GET /api/customers - list the owner's CRM contacts with booking stats
// Query params: q (search), tag (filter by tag), tags=1 (return only available tags)
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const userId = (session.user as any).id;
    const { searchParams } = new URL(request.url);
    const q = searchParams.get('q')?.trim();
    const tag = searchParams.get('tag')?.trim().toLowerCase();

    // Tag-only mode: return all distinct tags for quick filter chips
    if (searchParams.get('tags')) {
      const customers = await prisma.customer.findMany({
        where: { userId },
        select: { tags: true },
      });
      const tagCounts = new Map<string, number>();
      for (const customer of customers) {
        for (const item of customer.tags) {
          tagCounts.set(item, (tagCounts.get(item) || 0) + 1);
        }
      }
      const tags = Array.from(tagCounts.entries())
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
      return NextResponse.json({ success: true, data: tags });
    }

    const page = parseInt(searchParams.get('page') || '1');
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);

    const where: any = { userId };
    if (tag) {
      where.tags = { has: tag };
    }
    if (q) {
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
        { company: { contains: q, mode: 'insensitive' } },
        { phone: { contains: q } },
        { tags: { has: q.toLowerCase() } },
      ];
    }
    if (q && tag) {
      where.AND = [{ tags: { has: tag } }, { OR: where.OR }];
      delete where.OR;
      delete where.tags;
    }

    const [customers, total, totalsByMail, confirmedByMail] = await Promise.all([
      prisma.customer.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.customer.count({ where }),
      prisma.booking
        .groupBy({
          by: ['guestEmail'],
          where: {
            eventType: { bookingPage: { userId } },
            guestEmail: { not: '' },
          },
          _count: { _all: true },
          _max: { startTime: true },
        })
        .then((rows) =>
          rows.map((row) => ({
            email: (row.guestEmail || '').toLowerCase(),
            count: row._count._all,
            last: row._max.startTime,
          }))
        ),
      prisma.booking
        .groupBy({
          by: ['guestEmail'],
          where: {
            eventType: { bookingPage: { userId } },
            status: 'CONFIRMED',
          },
          _count: { _all: true },
        })
        .then((rows) =>
          rows.map((row) => ({
            email: (row.guestEmail || '').toLowerCase(),
            count: row._count._all,
          }))
        ),
    ]);

    const totalMap = new Map(totalsByMail.map((row) => [row.email, row]));
    const confirmedMap = new Map(confirmedByMail.map((row) => [row.email, row.count]));

    const data = customers.map((customer) => {
      const stats = totalMap.get(customer.email.toLowerCase());
      return {
        ...customer,
        totalBookings: stats?.count || 0,
        confirmedBookings: confirmedMap.get(customer.email.toLowerCase()) || 0,
        lastBookingAt: stats?.last || null,
      };
    });

    return NextResponse.json({
      success: true,
      data,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error('Error fetching customers:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/customers - add a contact by hand (a walk-in, a phone call, a
 * referral). The address is the contact's identity, so typing one that already
 * exists (or a phone another card holds) never creates a second row silently:
 * the route answers 409 with the contacts that already own it and the dialog
 * offers folding the typed values into one of them.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const userId = (session.user as any).id as string;
    const body = await request.json();

    const email = normalizeEmail(typeof body.email === 'string' ? body.email : '');
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ success: false, error: 'Invalid email address' }, { status: 400 });
    }

    const draft: ContactDraft = {
      name: typeof body.name === 'string' ? body.name : null,
      company: typeof body.company === 'string' ? body.company : null,
      phone: typeof body.phone === 'string' ? body.phone : null,
      photo: typeof body.photo === 'string' ? body.photo : null,
      notes: typeof body.notes === 'string' ? body.notes : null,
      tags: Array.isArray(body.tags)
        ? body.tags.filter((tag: unknown): tag is string => typeof tag === 'string')
        : [],
    };
    const phone = draft.phone?.trim() || '';
    const requestedPrimaryId = typeof body.primaryId === 'string' ? body.primaryId : null;

    // The address already belongs to a contact: its data is the contact.
    const sameEmail = (
      await prisma.customer.findMany({
        where: { userId, email: { contains: email, mode: 'insensitive' } },
        orderBy: { createdAt: 'asc' },
      })
    ).filter((row) => normalizeEmail(row.email) === email);

    if (sameEmail.length > 0) {
      const target = sameEmail.find((row) => row.id === requestedPrimaryId) ?? sameEmail[0];

      if (body.mergeOnConflict !== true) {
        const conflict: CreateConflictPayload = {
          kind: 'email',
          key: email,
          contacts: await Promise.all(
            sameEmail.map((row) => buildConflictContact(row, row.email, normalizeEmail(row.email)))
          ),
          suggestedPrimaryId: target.id,
        };
        return NextResponse.json(
          { success: false, error: EMAIL_ALREADY_EXISTS, conflict },
          { status: 409 }
        );
      }

      const customer = await adoptDraftIntoContact(userId, target, draft, { prisma });
      if (!customer) {
        return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
      }

      console.info(
        `CRM contact created by hand: owner ${userId} added the data to existing contact ${target.id} (${email})`
      );
      return NextResponse.json({ success: true, data: { created: false, merged: true, customer } });
    }

    // A shared number may well be two different people (a family, a reception
    // desk), so it is only an offer: fold the typed data into one of the cards
    // that already hold it, or create the card anyway.
    const samePhone = phone ? await findContactsByPhone(userId, phone, { prisma }) : [];
    if (samePhone.length > 0) {
      const byAge = [...samePhone].sort(
        (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
      );
      const target = byAge.find((row) => row.id === requestedPrimaryId) ?? byAge[0];

      if (body.mergePhoneOnConflict === true) {
        const customer = await adoptDraftIntoContact(userId, target, draft, { prisma });
        if (!customer) {
          return NextResponse.json(
            { success: false, error: 'Internal server error' },
            { status: 500 }
          );
        }

        console.info(
          `CRM contact created by hand: owner ${userId} added the data to contact ${target.id} (phone ${phone})`
        );
        return NextResponse.json({ success: true, data: { created: false, merged: true, customer } });
      }

      if (body.sharedPhoneConfirmed !== true) {
        const conflict: CreateConflictPayload = {
          kind: 'phone',
          key: phone,
          contacts: await Promise.all(
            byAge.map((row) => buildConflictContact(row, row.email, normalizeEmail(row.email)))
          ),
          suggestedPrimaryId: target.id,
        };
        return NextResponse.json(
          { success: false, error: PHONE_ALREADY_EXISTS, conflict },
          { status: 409 }
        );
      }
    }

    // Plan limit: the CRM caps how many contacts an account stores.
    const quota = await prisma.quotas.findUnique({
      where: { userId },
      select: { maxCustomers: true },
    });
    const maxCustomers = quota?.maxCustomers ?? 1000;
    if (maxCustomers !== -1) {
      const count = await prisma.customer.count({ where: { userId } });
      if (count >= maxCustomers) {
        return NextResponse.json(
          {
            success: false,
            error: `Límite de clientes alcanzado (${count}/${maxCustomers}). Mejora tu plan para añadir más contactos.`,
          },
          { status: 403 }
        );
      }
    }

    const customer = await prisma.customer.create({
      data: {
        userId,
        email,
        name: draft.name?.trim() || null,
        company: draft.company?.trim() || null,
        phone: phone || null,
        photo: draft.photo?.trim() || null,
        notes: draft.notes?.trim() || null,
        tags: [
          ...new Set(
            (draft.tags || [])
              .map((tag) => tag.trim().toLowerCase())
              .filter(Boolean)
              .slice(0, 20)
          ),
        ],
      },
    });

    return NextResponse.json(
      { success: true, data: { created: true, merged: false, customer } },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error creating customer:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
