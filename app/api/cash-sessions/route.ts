import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getActor, requireCapability, errorResponse, readJson } from '@/lib/api-payments';
import { getCashSession, cashFlowFromMovements, openCashSession } from '@/lib/cash';

export const dynamic = 'force-dynamic';

/**
 * GET /api/cash-sessions — current open drawer (with its live expected balance)
 * plus the most recent closed shifts.
 */
export async function GET(request: NextRequest) {
  try {
    const actor = await getActor();
    const denied = requireCapability(actor, 'drawer');
    if (denied) return denied;

    const url = new URL(request.url);
    const locationId = url.searchParams.get('locationId') || null;

    const current = await getCashSession({ userId: actor!.userId, locationId });
    const currentWithMovements = current
      ? await prisma.cashSession.findUnique({
          where: { id: current.id },
          include: {
            movements: { orderBy: { createdAt: 'asc' } },
            location: { select: { id: true, name: true } },
          },
        })
      : null;

    const history = await prisma.cashSession.findMany({
      where: { userId: actor!.userId, status: 'CLOSED', ...(locationId ? { locationId } : {}) },
      orderBy: { openedAt: 'desc' },
      take: 20,
      include: { location: { select: { id: true, name: true } } },
    });

    return NextResponse.json({
      success: true,
      data: {
        current: currentWithMovements
          ? {
              ...currentWithMovements,
              flow: cashFlowFromMovements(currentWithMovements.openingCents, currentWithMovements.movements),
            }
          : null,
        history,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * POST /api/cash-sessions — open a drawer shift.
 * Body: { openingCents, locationId?, note? }
 */
export async function POST(request: NextRequest) {
  try {
    const actor = await getActor();
    const denied = requireCapability(actor, 'drawer');
    if (denied) return denied;

    const body = await readJson(request);
    const session = await openCashSession(
      {
        userId: actor!.userId,
        locationId: body.locationId ?? null,
        openingCents: body.openingCents ?? 0,
        note: body.note ?? null,
        actor: { id: actor!.userId, name: actor!.name },
      },
    );

    return NextResponse.json({ success: true, data: session }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
