import { NextRequest, NextResponse } from 'next/server';
import { getActor, requireCapability, errorResponse, readJson } from '@/lib/api-payments';
import { closeCashSession } from '@/lib/cash';

export const dynamic = 'force-dynamic';

/**
 * POST /api/cash-sessions/[id]/close — arqueo + cierre del turno.
 *
 * Body: { countedCents, note? }
 *
 * Computes the expected drawer cash (opening float + CASH in − CASH out),
 * stores counted + difference and freezes the period. Also returns the
 * per-method totals of the shift for the closing report.
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
    const { session, summary } = await closeCashSession(
      {
        sessionId: params.id,
        userId: actor!.userId,
        countedCents: body.countedCents,
        note: body.note ?? null,
        actor: { id: actor!.userId, name: actor!.name },
      },
    );

    return NextResponse.json({ success: true, data: { session, summary } });
  } catch (error) {
    return errorResponse(error);
  }
}
