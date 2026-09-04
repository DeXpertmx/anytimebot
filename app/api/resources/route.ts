import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

const RESOURCE_TYPES = ['ROOM', 'CHAIR', 'EQUIPMENT', 'STATION', 'OTHER'];

function isValidTime(time: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(time);
}

// GET /api/resources - list the owner's bookable resources (with site + own schedule)
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const resources = await prisma.resource.findMany({
      where: { userId: (session.user as any).id },
      include: {
        location: { select: { id: true, name: true } },
        availabilities: { orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }] },
        _count: { select: { bookings: true } },
      },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    });

    return NextResponse.json({ success: true, data: resources });
  } catch (error) {
    console.error('Error fetching resources:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST /api/resources - create a resource, optionally with its own schedule rules
// (own rules substitute the page schedule; empty = inherit page schedule).
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { name, type, locationId, capacity, isActive, availability } = body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json(
        { success: false, error: 'El nombre del recurso es obligatorio' },
        { status: 400 }
      );
    }
    if (type && !RESOURCE_TYPES.includes(type)) {
      return NextResponse.json({ success: false, error: 'Tipo de recurso inválido' }, { status: 400 });
    }
    const parsedCapacity = capacity !== undefined ? parseInt(capacity) : 1;
    if (Number.isNaN(parsedCapacity) || parsedCapacity < 1 || parsedCapacity > 999) {
      return NextResponse.json(
        { success: false, error: 'La capacidad debe ser un número entre 1 y 999' },
        { status: 400 }
      );
    }

    // If a site is given it must belong to the user.
    if (locationId) {
      const loc = await prisma.location.findFirst({
        where: { id: locationId, userId: (session.user as any).id },
      });
      if (!loc) {
        return NextResponse.json({ success: false, error: 'Sede no encontrada' }, { status: 404 });
      }
    }

    // Validate optional own schedule rows.
    const rules = Array.isArray(availability) ? availability : [];
    for (const rule of rules) {
      if (
        !Number.isInteger(rule.dayOfWeek) ||
        rule.dayOfWeek < 0 ||
        rule.dayOfWeek > 6 ||
        !isValidTime(rule.startTime) ||
        !isValidTime(rule.endTime) ||
        rule.startTime >= rule.endTime
      ) {
        return NextResponse.json(
          { success: false, error: 'Horario propio inválido (día 0-6 y franjas con hora de fin posterior)' },
          { status: 400 }
        );
      }
    }

    const resource = await prisma.resource.create({
      data: {
        userId: (session.user as any).id,
        name: name.trim(),
        type: type || 'ROOM',
        locationId: locationId || null,
        capacity: parsedCapacity,
        isActive: isActive !== undefined ? !!isActive : true,
        availabilities: {
          create: rules.map((r: { dayOfWeek: number; startTime: string; endTime: string }) => ({
            dayOfWeek: r.dayOfWeek,
            startTime: r.startTime,
            endTime: r.endTime,
            isAvailable: true,
          })),
        },
      },
      include: {
        location: { select: { id: true, name: true } },
        availabilities: true,
      },
    });

    return NextResponse.json({ success: true, data: resource }, { status: 201 });
  } catch (error) {
    console.error('Error creating resource:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
