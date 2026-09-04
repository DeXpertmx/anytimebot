import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

// PUT /api/locations/[id] - update a physical site (ownership checked)
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const existing = await prisma.location.findFirst({
      where: { id: params.id, userId: (session.user as any).id },
    });
    if (!existing) {
      return NextResponse.json({ success: false, error: 'Sede no encontrada' }, { status: 404 });
    }

    const body = await request.json();
    const { name, address, city, country, timezone, isActive } = body;

    if (name !== undefined && (!name || typeof name !== 'string' || !name.trim())) {
      return NextResponse.json(
        { success: false, error: 'El nombre de la sede es obligatorio' },
        { status: 400 }
      );
    }

    const location = await prisma.location.update({
      where: { id: params.id },
      data: {
        ...(name !== undefined ? { name: String(name).trim() } : {}),
        ...(address !== undefined ? { address: address || null } : {}),
        ...(city !== undefined ? { city: city || null } : {}),
        ...(country !== undefined ? { country: country || null } : {}),
        ...(timezone !== undefined ? { timezone: timezone || 'UTC' } : {}),
        ...(isActive !== undefined ? { isActive: !!isActive } : {}),
      },
    });

    return NextResponse.json({ success: true, data: location });
  } catch (error) {
    console.error('Error updating location:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE /api/locations/[id] - remove a physical site (resources become floating)
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const existing = await prisma.location.findFirst({
      where: { id: params.id, userId: (session.user as any).id },
    });
    if (!existing) {
      return NextResponse.json({ success: false, error: 'Sede no encontrada' }, { status: 404 });
    }

    // Resources on this site keep existing (location_id → NULL via SET NULL),
    // so past bookings keep their snapshot and the user's resources are not lost.
    await prisma.location.delete({ where: { id: params.id } });

    return NextResponse.json({ success: true, message: 'Sede eliminada correctamente' });
  } catch (error) {
    console.error('Error deleting location:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
