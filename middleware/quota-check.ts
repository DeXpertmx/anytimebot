
// Middleware for quota checking

import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { checkUserQuota } from '@/lib/usage-tracker';

export async function requireQuota(action: 'ai' | 'video' | 'whatsapp' | 'telegram') {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    throw new Error('Unauthorized');
  }

  const check = await checkUserQuota(session.user.id, action);

  if (!check.allowed) {
    throw new Error(check.reason || 'Quota exceeded');
  }

  return {
    userId: session.user.id,
    quotas: check.quotas,
    usage: check.usage,
  };
}

export async function requirePlan(allowedPlans: string[]) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    throw new Error('Unauthorized');
  }

  const { prisma } = await import('@/lib/db');
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { plan: true },
  });

  if (!user || !allowedPlans.includes(user.plan)) {
    throw new Error(`This feature requires one of: ${allowedPlans.join(', ')}`);
  }

  return user;
}
