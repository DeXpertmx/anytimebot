
// Plan Configuration and Quota Management

export type PlanTier = 'FREE' | 'PRO' | 'TEAM' | 'ENTERPRISE';

export interface PlanQuotas {
  bookingPages: number;
  aiInteractions: number;
  botDocuments: number;
  videoMinutes: number;
  videoRecording: boolean;
  videoTranscription: boolean;
  whatsappMessages: number;
  telegramMessages: number;
  teamMembers: number;
  teamScheduling: boolean;
  canUseWhatsApp: boolean;
  canUseTelegram: boolean;
  canUseEvolution: boolean;
  canUseTwilio: boolean;
}

export interface PlanDetails {
  name: string;
  price: number;
  priceId?: string; // Stripe Price ID
  description: string;
  features: string[];
  quotas: PlanQuotas;
  cta: string;
  popular?: boolean;
}

export const PLAN_CONFIG: Record<PlanTier, PlanDetails> = {
  FREE: {
    name: 'Free',
    price: 0,
    description: 'Perfect for getting started',
    features: [
      '1 booking page',
      'Google Calendar sync',
      'Web widget + direct link',
      'External video links (Zoom/Google Meet)',
      'Basic email notifications',
    ],
    quotas: {
      bookingPages: 1,
      aiInteractions: 0,
      botDocuments: 0,
      videoMinutes: 0,
      videoRecording: false,
      videoTranscription: false,
      whatsappMessages: 0,
      telegramMessages: 0,
      teamMembers: 0,
      teamScheduling: false,
      canUseWhatsApp: false,
      canUseTelegram: false,
      canUseEvolution: false,
      canUseTwilio: false,
    },
    cta: 'Get Started',
  },
  PRO: {
    name: 'Pro',
    price: 19,
    priceId: process.env.STRIPE_PRICE_PRO || 'price_pro',
    description: 'For professionals who need AI power',
    features: [
      'Everything in Free, plus:',
      'Anytime Assistant (trainable chatbot)',
      'Up to 5 documents for AI training',
      'Anytime Meeting Rooms (100 min/mo)',
      'Video recording + transcription',
      'WhatsApp via Evolution API',
      'Pre-meeting briefs',
      '200 AI interactions/mo',
    ],
    quotas: {
      bookingPages: 10,
      aiInteractions: 200,
      botDocuments: 5,
      videoMinutes: 100,
      videoRecording: true,
      videoTranscription: true,
      whatsappMessages: 1000,
      telegramMessages: 0,
      teamMembers: 1,
      teamScheduling: false,
      canUseWhatsApp: true,
      canUseTelegram: false,
      canUseEvolution: true,
      canUseTwilio: false,
    },
    cta: 'Upgrade to Pro',
    popular: true,
  },
  TEAM: {
    name: 'Team',
    price: 49,
    priceId: process.env.STRIPE_PRICE_TEAM || 'price_team',
    description: 'For teams that work together',
    features: [
      'Everything in Pro, plus:',
      'Team scheduling (up to 5 members)',
      'WhatsApp via Twilio (enterprise-grade)',
      'Telegram integration',
      '50 documents for AI',
      '500 AI interactions/mo',
      '500 video minutes/mo',
      'Round-robin & smart routing',
      'Advanced analytics',
    ],
    quotas: {
      bookingPages: 50,
      aiInteractions: 500,
      botDocuments: 50,
      videoMinutes: 500,
      videoRecording: true,
      videoTranscription: true,
      whatsappMessages: 5000,
      telegramMessages: 5000,
      teamMembers: 5,
      teamScheduling: true,
      canUseWhatsApp: true,
      canUseTelegram: true,
      canUseEvolution: true,
      canUseTwilio: true,
    },
    cta: 'Upgrade to Team',
  },
  ENTERPRISE: {
    name: 'Enterprise',
    price: 0, // Custom pricing
    description: 'For large organizations',
    features: [
      'Unlimited everything',
      'Unlimited team members',
      'Unlimited AI interactions',
      'Unlimited video minutes',
      'Unlimited documents',
      'SSO & advanced security',
      'Dedicated support',
      'Custom AI models',
      'White-label options',
      'SLA guarantee',
    ],
    quotas: {
      bookingPages: -1, // -1 = unlimited
      aiInteractions: -1,
      botDocuments: -1,
      videoMinutes: -1,
      videoRecording: true,
      videoTranscription: true,
      whatsappMessages: -1,
      telegramMessages: -1,
      teamMembers: -1,
      teamScheduling: true,
      canUseWhatsApp: true,
      canUseTelegram: true,
      canUseEvolution: true,
      canUseTwilio: true,
    },
    cta: 'Contact Sales',
  },
};

// Stripe Price IDs - Set these in .env
export const STRIPE_PRICES = {
  PRO: process.env.STRIPE_PRICE_PRO || 'price_pro_placeholder',
  TEAM: process.env.STRIPE_PRICE_TEAM || 'price_team_placeholder',
};

// Helper to get plan details
export function getPlanDetails(plan: PlanTier): PlanDetails {
  return PLAN_CONFIG[plan];
}

// Helper to check if a user can perform an action
export function canPerformAction(
  quotas: PlanQuotas,
  usage: { aiInteractions?: number; videoMinutes?: number; whatsappMessages?: number; telegramMessages?: number },
  action: 'ai' | 'video' | 'whatsapp' | 'telegram'
): { allowed: boolean; reason?: string } {
  switch (action) {
    case 'ai':
      if (quotas.aiInteractions === 0) {
        return { allowed: false, reason: 'AI features require Pro plan or higher' };
      }
      if (quotas.aiInteractions > 0 && (usage.aiInteractions || 0) >= quotas.aiInteractions) {
        return { allowed: false, reason: `AI quota exceeded (${quotas.aiInteractions}/mo). Upgrade your plan.` };
      }
      return { allowed: true };
    
    case 'video':
      if (quotas.videoMinutes === 0) {
        return { allowed: false, reason: 'Video features require Pro plan or higher' };
      }
      if (quotas.videoMinutes > 0 && (usage.videoMinutes || 0) >= quotas.videoMinutes) {
        return { allowed: false, reason: `Video quota exceeded (${quotas.videoMinutes} min/mo). Upgrade your plan.` };
      }
      return { allowed: true };
    
    case 'whatsapp':
      if (!quotas.canUseWhatsApp) {
        return { allowed: false, reason: 'WhatsApp requires Pro plan or higher' };
      }
      if (quotas.whatsappMessages > 0 && (usage.whatsappMessages || 0) >= quotas.whatsappMessages) {
        return { allowed: false, reason: `WhatsApp quota exceeded (${quotas.whatsappMessages}/mo). Upgrade your plan.` };
      }
      return { allowed: true };
    
    case 'telegram':
      if (!quotas.canUseTelegram) {
        return { allowed: false, reason: 'Telegram requires Team plan or higher' };
      }
      if (quotas.telegramMessages > 0 && (usage.telegramMessages || 0) >= quotas.telegramMessages) {
        return { allowed: false, reason: `Telegram quota exceeded (${quotas.telegramMessages}/mo). Upgrade your plan.` };
      }
      return { allowed: true };
    
    default:
      return { allowed: false, reason: 'Unknown action' };
  }
}

// Initialize quotas for a new user
export async function initializeUserQuotas(userId: string, plan: PlanTier) {
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();
  
  try {
    const quotas = PLAN_CONFIG[plan].quotas;
    
    // Create quotas
    await prisma.quotas.upsert({
      where: { userId },
      create: {
        userId,
        ...quotas,
      },
      update: quotas,
    });
    
    // Create usage tracking
    await prisma.usage.upsert({
      where: { userId },
      create: {
        userId,
        aiInteractions: 0,
        videoMinutes: 0,
        whatsappMessages: 0,
        telegramMessages: 0,
        lastResetAt: new Date(),
      },
      update: {},
    });
  } finally {
    await prisma.$disconnect();
  }
}

// Update quotas when plan changes
export async function updateUserPlanQuotas(userId: string, newPlan: PlanTier) {
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();
  
  try {
    const quotas = PLAN_CONFIG[newPlan].quotas;
    
    await prisma.quotas.update({
      where: { userId },
      data: quotas,
    });
    
    // Update user plan
    await prisma.user.update({
      where: { id: userId },
      data: { plan: newPlan },
    });
  } finally {
    await prisma.$disconnect();
  }
}

// Reset monthly usage (should be called by cron job)
export async function resetMonthlyUsage() {
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();
  
  try {
    const now = new Date();
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    
    // Reset usage for all users who haven't been reset this month
    await prisma.usage.updateMany({
      where: {
        lastResetAt: {
          lt: lastMonth,
        },
      },
      data: {
        aiInteractions: 0,
        videoMinutes: 0,
        whatsappMessages: 0,
        telegramMessages: 0,
        lastResetAt: now,
      },
    });
    
    console.log('✅ Monthly usage reset completed');
  } finally {
    await prisma.$disconnect();
  }
}
