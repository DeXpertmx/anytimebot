export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getAdminUser } from '@/lib/admin';
import { prisma } from '@/lib/db';
import { getStripeMode } from '@/lib/stripe-mode';

const DEPLOY_STATUS_KEY = 'deploy.status';

/**
 * GET /api/admin/system-status
 * Operational snapshot for the admin status panel:
 *   - lastDeployment: result written by npm run deploy:verify / CI smoke
 *   - stripeMode:     active payments mode ('live' | 'test')
 *   - smokeEvent:     whether the permanent paid event used by the smoke exists
 */
export async function GET() {
  const admin = await getAdminUser();
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const [deployRow, stripeMode, smokeEvent] = await Promise.all([
    prisma.systemSetting.findUnique({
      where: { key: DEPLOY_STATUS_KEY },
      select: { value: true, updatedAt: true },
    }),
    getStripeMode().catch(() => null),
    prisma.eventType.findFirst({
      where: { name: 'Smoke Test Event', collectPayment: true },
      select: {
        id: true,
        bookingPage: { select: { slug: true, isActive: true } },
      },
    }),
  ]);

  const value: unknown = deployRow?.value;
  const lastDeployment =
    typeof value === 'object' && value !== null
      ? (value as Record<string, unknown>)
      : null;

  return NextResponse.json({
    lastDeployment: lastDeployment
      ? {
          ok: lastDeployment.ok === true,
          ranAt:
            typeof lastDeployment.ranAt === 'string'
              ? lastDeployment.ranAt
              : deployRow?.updatedAt?.toISOString() ?? null,
          appUrl: typeof lastDeployment.appUrl === 'string' ? lastDeployment.appUrl : null,
          commit: typeof lastDeployment.commit === 'string' ? lastDeployment.commit : null,
          durationSec: typeof lastDeployment.durationSec === 'number' ? lastDeployment.durationSec : null,
          steps:
            typeof lastDeployment.steps === 'object' && lastDeployment.steps !== null
              ? (lastDeployment.steps as Record<string, boolean | null>)
              : {},
        }
      : null,
    stripeMode,
    smokeEvent: smokeEvent
      ? {
          id: smokeEvent.id,
          pageSlug: smokeEvent.bookingPage.slug,
          pageActive: smokeEvent.bookingPage.isActive,
        }
      : null,
  });
}
