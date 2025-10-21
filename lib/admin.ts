
// Admin Utility Functions

import { prisma } from './db';
import { getServerSession } from 'next-auth';
import { authOptions } from './auth';

export async function isAdmin(): Promise<boolean> {
  const session = await getServerSession(authOptions);
  if (!session?.user) return false;
  
  const user = await prisma.user.findUnique({
    where: { email: session.user.email || '' },
    select: { role: true },
  });
  
  return user?.role === 'ADMIN';
}

export async function requireAdmin() {
  const admin = await isAdmin();
  if (!admin) {
    throw new Error('Unauthorized: Admin access required');
  }
}

export async function getAdminUser() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return null;
  
  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true, email: true, role: true, name: true },
  });
  
  if (user?.role !== 'ADMIN') return null;
  return user;
}

// Audit logging
export async function logAdminAction(
  adminId: string,
  action: string,
  targetId: string | null,
  details: any,
  request?: Request
) {
  const ipAddress = request?.headers.get('x-forwarded-for') || request?.headers.get('x-real-ip') || null;
  const userAgent = request?.headers.get('user-agent') || null;
  
  await prisma.adminAuditLog.create({
    data: {
      adminId,
      action,
      targetId,
      details,
      ipAddress,
      userAgent,
    },
  });
}

// Cost estimation (OpenAI + Daily.co)
export function estimateCosts(usage: {
  aiInteractions: number;
  videoMinutes: number;
}) {
  // OpenAI costs (rough estimates)
  // GPT-4: ~$0.03 per 1K tokens, assume avg 500 tokens per interaction
  const aiCost = (usage.aiInteractions * 500 * 0.03) / 1000;
  
  // Daily.co costs: ~$0.0015 per minute
  const videoCost = usage.videoMinutes * 0.0015;
  
  return {
    aiCost: parseFloat(aiCost.toFixed(2)),
    videoCost: parseFloat(videoCost.toFixed(2)),
    total: parseFloat((aiCost + videoCost).toFixed(2)),
  };
}

// Calculate MRR (Monthly Recurring Revenue)
export async function calculateMRR() {
  const activeSubscriptions = await prisma.subscription.findMany({
    where: {
      status: 'ACTIVE',
    },
    include: {
      user: {
        select: {
          plan: true,
        },
      },
    },
  });
  
  let mrr = 0;
  activeSubscriptions.forEach((sub) => {
    const plan = sub.user.plan;
    switch (plan) {
      case 'PRO':
        mrr += 19;
        break;
      case 'TEAM':
        mrr += 49;
        break;
      case 'ENTERPRISE':
        // Custom pricing, would need to be tracked separately
        break;
    }
  });
  
  return mrr;
}

// Get heavy users
export async function getHeavyUsers(limit = 5) {
  const users = await prisma.user.findMany({
    include: {
      usage: true,
    },
    orderBy: {
      usage: {
        aiInteractions: 'desc',
      },
    },
    take: limit,
  });
  
  return users.map((user) => ({
    id: user.id,
    email: user.email,
    name: user.name,
    plan: user.plan,
    aiInteractions: user.usage?.aiInteractions || 0,
    videoMinutes: user.usage?.videoMinutes || 0,
    whatsappMessages: user.usage?.whatsappMessages || 0,
    estimatedCost: estimateCosts({
      aiInteractions: user.usage?.aiInteractions || 0,
      videoMinutes: user.usage?.videoMinutes || 0,
    }).total,
  }));
}

// Detect abnormal usage
export async function detectAbnormalUsage() {
  const users = await prisma.user.findMany({
    include: {
      usage: true,
    },
    where: {
      OR: [
        { usage: { aiInteractions: { gte: 1000 } } },
        { usage: { videoMinutes: { gte: 500 } } },
        { usage: { whatsappMessages: { gte: 2000 } } },
      ],
    },
  });
  
  return users.map((user) => ({
    id: user.id,
    email: user.email,
    name: user.name,
    plan: user.plan,
    usage: user.usage,
    flags: [
      user.usage && user.usage.aiInteractions >= 1000 ? 'High AI usage' : null,
      user.usage && user.usage.videoMinutes >= 500 ? 'High video usage' : null,
      user.usage && user.usage.whatsappMessages >= 2000 ? 'High WhatsApp usage' : null,
    ].filter(Boolean),
  }));
}
