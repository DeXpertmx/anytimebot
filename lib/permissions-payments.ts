/**
 * Permission matrix for the manual sales & payments module (Fase 0, decision
 * B1). Today only the tenant owner reaches the dashboard, so every check
 * passes for them; when team members get their own sessions, wire their
 * TeamMemberRole here and the routes below are already gated.
 *
 * Matrix (approved):
 *  - OWNER (tenant user): everything.
 *  - TeamMember ADMIN: collect, annul, refund, drawer, reports.
 *  - TeamMember MEMBER: collect only (register payments, no annulling, no
 *    refunds, no drawer, no reports).
 */

export type PaymentsCapability =
  | 'collect' // register payments (cash, card terminal, transfer, Bizum...)
  | 'annul' // annul payments / void orders (reason required)
  | 'refund' // hand money back (manual refunds)
  | 'drawer' // open/close the cash session, manual movements
  | 'reports'; // payment & revenue reports, CSV export

const OWNER: PaymentsCapability[] = ['collect', 'annul', 'refund', 'drawer', 'reports'];

const TEAM_ADMIN: PaymentsCapability[] = ['collect', 'annul', 'refund', 'drawer', 'reports'];

const TEAM_MEMBER: PaymentsCapability[] = ['collect'];

const MATRIX: Record<string, PaymentsCapability[]> = {
  owner: OWNER,
  team_admin: TEAM_ADMIN,
  team_member: TEAM_MEMBER,
};

export interface SessionActor {
  /** Tenant owner id (the `user.id` every query is scoped by). */
  userId: string;
  /** True when the session belongs to the tenant owner (today: always). */
  isOwner: boolean;
  /** TeamMemberRole when a member session exists; null for the owner. */
  teamRole?: 'OWNER' | 'ADMIN' | 'MEMBER' | null;
}

/** Capabilities of the current session actor. */
export function capabilities(actor: SessionActor): PaymentsCapability[] {
  if (actor.isOwner) return MATRIX.owner;
  if (actor.teamRole === 'ADMIN') return MATRIX.team_admin;
  if (actor.teamRole === 'MEMBER') return MATRIX.team_member;
  return [];
}

export function can(actor: SessionActor, capability: PaymentsCapability): boolean {
  return capabilities(actor).includes(capability);
}
