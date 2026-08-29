import { prisma } from '@/lib/db';

/**
 * Current privacy/terms version used for consent tracking (GDPR Art. 7).
 * Bump this number whenever the privacy policy or terms materially change so
 * existing subjects must re-confirm.
 */
export const CONSENT_VERSION = '2026-08';

export interface ConsentContext {
  purpose: string;
  subjectEmail: string;
  tenantId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

/**
 * Record a consent (or withdrawal) with granular proof: who, when, which
 * purpose, which policy version, and the technical context.
 */
export async function recordConsent(
  ctx: ConsentContext,
  granted: boolean,
): Promise<{ ok: boolean }> {
  try {
    await prisma.consentLog.create({
      data: {
        subjectEmail: ctx.subjectEmail,
        tenantId: ctx.tenantId ?? null,
        purpose: ctx.purpose,
        version: CONSENT_VERSION,
        granted,
        ipAddress: ctx.ipAddress ?? null,
        userAgent: ctx.userAgent ?? null,
        withdrawnAt: granted ? null : new Date(),
      },
    });
    return { ok: true };
  } catch (error) {
    console.error('Failed to record consent:', error);
    return { ok: false };
  }
}

/**
 * Whether the subject has any active (non-withdrawn) consent for a purpose.
 */
export async function hasAccepted(
  subjectEmail: string,
  purpose: string,
): Promise<boolean> {
  const latest = await prisma.consentLog.findFirst({
    where: { subjectEmail, purpose },
    orderBy: { createdAt: 'desc' },
  });
  return !!latest?.granted;
}

/**
 * Withdraw consent for a purpose (Art. 7(3)). Logs a new granted=false row so
 * the sequence of consent/withdrawal is auditable.
 */
export async function withdrawConsent(subjectEmail: string, purpose: string): Promise<boolean> {
  return (await recordConsent(
    { purpose, subjectEmail },
    false,
  )).ok;
}