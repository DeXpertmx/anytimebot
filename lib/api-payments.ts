import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { OrderError } from '@/lib/orders';
import { can, type PaymentsCapability, type SessionActor } from '@/lib/permissions-payments';

/** Resolve the session actor or null (routes answer 401). */
export async function getActor(): Promise<(SessionActor & { email: string; name: string | null }) | null> {
  const session = await getServerSession(authOptions);
  const id = (session?.user as any)?.id as string | undefined;
  if (!session?.user || !id) return null;
  return {
    userId: id,
    isOwner: true, // team-member sessions do not exist yet; matrix is ready (B1)
    teamRole: null,
    email: (session.user as any).email ?? '',
    name: session.user.name ?? null,
  };
}

/** Guard a capability; returns a 401/403 response when not allowed, else null. */
export function requireCapability(
  actor: { userId: string; isOwner: boolean; teamRole?: 'OWNER' | 'ADMIN' | 'MEMBER' | null } | null,
  capability: PaymentsCapability
): NextResponse | null {
  if (!actor) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  if (!can(actor, capability)) {
    return NextResponse.json({ success: false, error: 'No tienes permisos para esta acción' }, { status: 403 });
  }
  return null;
}

/** Map domain errors to HTTP responses; unexpected errors become 500 logs. */
export function errorResponse(error: unknown): NextResponse {
  if (error instanceof OrderError) {
    return NextResponse.json({ success: false, error: error.message }, { status: error.status });
  }
  console.error('[payments-api]', error);
  return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
}

/** Parse the JSON body defensively (empty object on malformed payloads). */
export async function readJson(request: NextRequest): Promise<any> {
  return request.json().catch(() => ({}));
}
