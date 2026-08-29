import { prisma } from '@/lib/db';

/**
 * Retention periods are configurable so legal/accounting requirements can be
 * applied per deployment. Defaults are deliberately conservative and should
 * be reviewed by the controller/DPO before production use.
 */
export const RETENTION_DAYS = {
  cancelledBookings: Number(process.env.RETENTION_CANCELLED_BOOKINGS_DAYS || 365),
  completedBookings: Number(process.env.RETENTION_COMPLETED_BOOKINGS_DAYS || 730),
  consentLogs: Number(process.env.RETENTION_CONSENT_LOGS_DAYS || 1825),
  whatsappMessages: Number(process.env.RETENTION_WHATSAPP_MESSAGES_DAYS || 365),
  auditLogs: Number(process.env.RETENTION_AUDIT_LOGS_DAYS || 1825),
};

function before(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

/**
 * Remove data that has exceeded the configured retention period. This job is
 * intentionally scoped to operational data; account deletion remains the
 * mechanism for a complete subject erasure request.
 */
export async function enforceDataRetention() {
  const [cancelled, completed, messages, consents] = await prisma.$transaction([
    prisma.booking.deleteMany({
      where: {
        status: 'CANCELLED',
        updatedAt: { lt: before(RETENTION_DAYS.cancelledBookings) },
      },
    }),
    prisma.booking.deleteMany({
      where: {
        status: 'COMPLETED',
        updatedAt: { lt: before(RETENTION_DAYS.completedBookings) },
      },
    }),
    prisma.whatsAppMessage.deleteMany({
      where: { createdAt: { lt: before(RETENTION_DAYS.whatsappMessages) } },
    }),
    prisma.consentLog.deleteMany({
      where: { createdAt: { lt: before(RETENTION_DAYS.consentLogs) } },
    }),
  ]);

  return {
    cancelledBookings: cancelled.count,
    completedBookings: completed.count,
    whatsappMessages: messages.count,
    consentLogs: consents.count,
  };
}