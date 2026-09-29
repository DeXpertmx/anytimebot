import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getActor, requireCapability, errorResponse, readJson } from '@/lib/api-payments';
import { addManualMovement } from '@/lib/cash';

export const dynamic = 'force-dynamic';

/**
 * GET /api/cash-sessions/[id]/movements — the session's drawer history.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const actor = await getActor();
    const denied = requireCapability(actor, 'drawer');
    if (denied) return denied;

    const session = await prisma.cashSession.findFirst({
      where: { id: params.id, userId: actor!.userId },
    });
    if (!session) {
      return NextResponse.json({ success: false, error: 'Sesión de caja no encontrada' }, { status: 404 });
    }

    const movements = await prisma.cashMovement.findMany({
      where: { sessionId: session.id },
      orderBy: { createdAt: 'asc' },
    });

    return NextResponse.json({ success: true, data: movements });
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * POST /api/cash-sessions/[id]/movements — manual deposit/withdrawal.
 * Body: { type: 'DEPOSIT'|'WITHDRAWAL'|'ADJUSTMENT', direction: 'IN'|'OUT',
 * amountCents, concept }
 * Closed sessions are frozen (409).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const actor = await getActor();
    const denied = requireCapability(actor, 'drawer');
    if (denied) return denied;

    const body = await readJson(request);
    const movement = await addManualMovement(
      {
        sessionId: params.id,
        userId: actor!.userId,
        type: body.type,
        direction: body.direction,
        amountCents: body.amountCents,
        concept: body.concept,
        actor: { id: actor!.userId, name: actor!.name },
      },
    );

    return NextResponse.json({ success: true, data: movement }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
