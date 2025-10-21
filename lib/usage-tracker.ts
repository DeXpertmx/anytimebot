
// Usage Tracking Utilities

import { prisma } from './db';
import { canPerformAction, type PlanQuotas } from './plans';

export interface UsageStats {
  aiInteractions: { used: number; limit: number; percentage: number };
  videoMinutes: { used: number; limit: number; percentage: number };
  whatsappMessages: { used: number; limit: number; percentage: number };
  telegramMessages: { used: number; limit: number; percentage: number };
}

/**
 * Get current usage stats for a user
 */
export async function getUserUsageStats(userId: string): Promise<UsageStats | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      quotas: true,
      usage: true,
    },
  });

  if (!user?.quotas || !user?.usage) {
    return null;
  }

  const calculatePercentage = (used: number, limit: number) => {
    if (limit === 0) return 0;
    if (limit === -1) return 0; // Unlimited
    return Math.min(Math.round((used / limit) * 100), 100);
  };

  return {
    aiInteractions: {
      used: user.usage.aiInteractions,
      limit: user.quotas.aiInteractions,
      percentage: calculatePercentage(user.usage.aiInteractions, user.quotas.aiInteractions),
    },
    videoMinutes: {
      used: user.usage.videoMinutes,
      limit: user.quotas.videoMinutes,
      percentage: calculatePercentage(user.usage.videoMinutes, user.quotas.videoMinutes),
    },
    whatsappMessages: {
      used: user.usage.whatsappMessages,
      limit: user.quotas.whatsappMessages,
      percentage: calculatePercentage(user.usage.whatsappMessages, user.quotas.whatsappMessages),
    },
    telegramMessages: {
      used: user.usage.telegramMessages,
      limit: user.quotas.telegramMessages,
      percentage: calculatePercentage(user.usage.telegramMessages, user.quotas.telegramMessages),
    },
  };
}

/**
 * Check if user can perform an action and return detailed info
 */
export async function checkUserQuota(
  userId: string,
  action: 'ai' | 'video' | 'whatsapp' | 'telegram'
): Promise<{ allowed: boolean; reason?: string; usage?: any; quotas?: any }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      quotas: true,
      usage: true,
    },
  });

  if (!user?.quotas || !user?.usage) {
    return { allowed: false, reason: 'User quotas not initialized' };
  }

  const result = canPerformAction(user.quotas, user.usage, action);

  return {
    ...result,
    usage: user.usage,
    quotas: user.quotas,
  };
}

/**
 * Increment usage counter for a specific action
 */
export async function incrementUsage(
  userId: string,
  action: 'ai' | 'video' | 'whatsapp' | 'telegram',
  amount: number = 1
): Promise<void> {
  const updateData: any = {};

  switch (action) {
    case 'ai':
      updateData.aiInteractions = { increment: amount };
      break;
    case 'video':
      updateData.videoMinutes = { increment: amount };
      break;
    case 'whatsapp':
      updateData.whatsappMessages = { increment: amount };
      break;
    case 'telegram':
      updateData.telegramMessages = { increment: amount };
      break;
  }

  await prisma.usage.update({
    where: { userId },
    data: updateData,
  });
}

/**
 * Check if user is at warning threshold (80%)
 */
export async function getUserWarnings(userId: string): Promise<string[]> {
  const stats = await getUserUsageStats(userId);
  const warnings: string[] = [];

  if (!stats) return warnings;

  if (stats.aiInteractions.percentage >= 80 && stats.aiInteractions.limit > 0) {
    warnings.push(`AI interactions: ${stats.aiInteractions.used}/${stats.aiInteractions.limit} (${stats.aiInteractions.percentage}%)`);
  }

  if (stats.videoMinutes.percentage >= 80 && stats.videoMinutes.limit > 0) {
    warnings.push(`Video minutes: ${stats.videoMinutes.used}/${stats.videoMinutes.limit} (${stats.videoMinutes.percentage}%)`);
  }

  if (stats.whatsappMessages.percentage >= 80 && stats.whatsappMessages.limit > 0) {
    warnings.push(`WhatsApp messages: ${stats.whatsappMessages.used}/${stats.whatsappMessages.limit} (${stats.whatsappMessages.percentage}%)`);
  }

  if (stats.telegramMessages.percentage >= 80 && stats.telegramMessages.limit > 0) {
    warnings.push(`Telegram messages: ${stats.telegramMessages.used}/${stats.telegramMessages.limit} (${stats.telegramMessages.percentage}%)`);
  }

  return warnings;
}

/**
 * Middleware to check quota before action
 */
export async function withQuotaCheck<T>(
  userId: string,
  action: 'ai' | 'video' | 'whatsapp' | 'telegram',
  operation: () => Promise<T>
): Promise<T> {
  const check = await checkUserQuota(userId, action);

  if (!check.allowed) {
    throw new Error(check.reason || 'Quota exceeded');
  }

  // Perform the operation
  const result = await operation();

  // Increment usage after successful operation
  await incrementUsage(userId, action);

  return result;
}
