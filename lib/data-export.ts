import { prisma } from '@/lib/db';

/**
 * Collect every exportable piece of personal data held for a user. Secrets
 * (password hashes, OAuth tokens, messaging keys) are intentionally omitted.
 */
export async function exportUserData(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      username: true,
      image: true,
      timezone: true,
      role: true,
      plan: true,
      subscriptionStatus: true,
      subscriptionEndsAt: true,
      whatsappPhone: true,
      calendarSyncEnabled: true,
      createdAt: true,
      updatedAt: true,
      accounts: { select: { provider: true } },
    },
  });

  if (!user) return null;

  const [quotas, usage, bookingPages, bots, teams, subscriptions, whatsappMessages, consentLogs] =
    await Promise.all([
      prisma.quotas.findUnique({ where: { userId } }),
      prisma.usage.findUnique({ where: { userId } }),
      prisma.bookingPage.findMany({
        where: { userId },
        include: {
          eventTypes: {
            include: {
              bookings: { include: { routingResponse: true, videoSession: true } },
              formFields: true,
            },
          },
          availability: true,
        },
      }),
      prisma.bot.findMany({
        where: { userId },
        include: { documents: true, conversations: true },
      }),
      prisma.team.findMany({
        where: { ownerId: userId },
        include: { members: true, eventTypes: true },
      }),
      prisma.subscription.findMany({ where: { userId } }),
      prisma.whatsAppMessage.findMany({ where: { userId } }),
      prisma.consentLog.findMany({
        where: { tenantId: userId },
        select: { subjectEmail: true, purpose: true, version: true, granted: true, createdAt: true, withdrawnAt: true },
      }),
    ]);

  return {
    generatedAt: new Date().toISOString(),
    schemaVersion: '1.0',
    account: {
      ...user,
      connectedProviders: user.accounts.map((account) => account.provider),
      accounts: undefined,
    },
    quotas,
    usage,
    bookingPages,
    bots: bots.map((bot) => ({
      id: bot.id,
      name: bot.name,
      avatar: bot.avatar,
      greeting: bot.greeting,
      personality: bot.personality,
      tone: bot.tone,
      isActive: bot.isActive,
      createdAt: bot.createdAt,
      documents: bot.documents.map((document) => ({
        id: document.id,
        fileName: document.fileName,
        fileType: document.fileType,
        url: document.url,
        content: document.content,
        createdAt: document.createdAt,
      })),
      conversations: bot.conversations,
    })),
    teams,
    subscriptions,
    whatsappMessages: whatsappMessages.map((message) => ({
      id: message.id,
      phone: message.phone,
      message: message.message,
      direction: message.direction,
      status: message.status,
      createdAt: message.createdAt,
    })),
    consentLogs,
  };
}