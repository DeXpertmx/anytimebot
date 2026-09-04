import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

const RESOURCE_TYPES = ['ROOM', 'CHAIR', 'EQUIPMENT', 'STATION', 'OTHER'];

function isValidTime(time: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(time);
}

// PUT /api/resources/[id] - update a resource and replace its own schedule rules
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const existing = await prisma.resource.findFirst({
      where: { id: params.id, userId: (session.user as any).id },
    });
    if (!existing) {
      return NextResponse.json({ success: false, error: 'Recurso no encontrado' }, { status: 404 });
    }

    const body = await request.json();
    const { name, type, locationId, capacity, isActive, availability } = body;

    if (name !== undefined && (!name || typeof name !== 'string' || !name.trim())) {
      return NextResponse.json(
        { success: false, error: 'El nombre del recurso es obligatorio' },
        { status: 400 }
      );
    }
    if (type !== undefined && !RESOURCE_TYPES.includes(type)) {
      return NextResponse.json({ success: false, error: 'Tipo de recurso inválido' }, { status: 400 });
    }
    if (capacity !== undefined) {
      const parsed = parseInt(capacity);
      if (Number.isNaN(parsed) || parsed < 1 || parsed > 999) {
        return NextResponse.json(
          { success: false, error: 'La capacidad debe ser un número entre 1 y 999' },
          { status: 400 }
        );
      }
    }
    if (locationId !== undefined && locationId) {
      const loc = await prisma.location.findFirst({
        where: { id: locationId, userId: (session.user as any).id },
      });
      if (!loc) {
        return NextResponse.json({ success: false, error: 'Sede no encontrada' }, { status: 404 });
      }
    }

    // Validate optional own schedule rows.
    const rules = Array.isArray(availability) ? availability : undefined;
    if (rules) {
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
    }

    const resource = await prisma.$transaction(async (tx) => {
      const updated = await tx.resource.update({
        where: { id: params.id },
        data: {
          ...(name !== undefined ? { name: String(name).trim() } : {}),
          ...(type !== undefined ? { type } : {}),
          ...(locationId !== undefined ? { locationId: locationId || null } : {}),
          ...(capacity !== undefined ? { capacity: parseInt(capacity) } : {}),
          ...(isActive !== undefined ? { isActive: !!isActive } : {}),
        },
      });

      if (rules) {
        // Replace the whole rule set atomically (empty array = inherit page schedule).
        await tx.availability.deleteMany({ where: { resourceId: params.id } });
        if (rules.length > 0) {
          await tx.availability.createMany({
            data: rules.map((r: { dayOfWeek: number; startTime: string; endTime: string }) => ({
              resourceId: params.id,
              dayOfWeek: r.dayOfWeek,
              startTime: r.startTime,
              endTime: r.endTime,
              isAvailable: true,
            })),
          });
        }
      }

      return tx.resource.findUnique({
        where: { id: params.id },
        include: {
          location: { select: { id: true, name: true } },
          availabilities: { orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }] },
        },
      });
    });

    return NextResponse.json({ success: true, data: resource });
  } catch (error) {
    console.error('Error updating resource:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE /api/resources/[id] - remove a resource (past bookings keep their snapshot)
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const existing = await prisma.resource.findFirst({
      where: { id: params.id, userId: (session.user as any).id },
    });
    if (!existing) {
      return NextResponse.json({ success: false, error: 'Recurso no encontrado' }, { status: 404 });
    }

    // Event-type links cascade; bookings keep their resourceName snapshot.
    await prisma.resource.delete({ where: { id: params.id } });

    return NextResponse.json({ success: true, message: 'Recurso eliminado correctamente' });
  } catch (error) {
    console.error('Error deleting resource:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
