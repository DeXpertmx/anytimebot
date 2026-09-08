import { prisma as defaultPrisma } from '@/lib/db';

/**
 * WhatsApp marketing sender — Twilio ONLY.
 *
 * Campaigns sent to customers must never go through Evolution API (a plain
 * WhatsApp gateway) because bulk messaging from it can get the tenant's
 * WhatsApp number blocked. Twilio's WhatsApp Business API is the approved
 * marketing channel, so the send helpers in this module refuse to fall back
 * to Evolution: when Twilio is not configured the send simply fails and the
 * UI surfaces the reason.
 */

export interface TwilioWhatsAppDeps {
  prisma?: typeof defaultPrisma;
  fetchImpl?: typeof fetch;
}

function resolveDeps(deps?: TwilioWhatsAppDeps) {
  return {
    prisma: deps?.prisma ?? defaultPrisma,
    fetchImpl: deps?.fetchImpl ?? fetch.bind(globalThis),
  };
}

export interface TwilioUserRow {
  id: string;
  twilioAccountSid: string | null;
  twilioAuthToken: string | null;
  twilioPhoneNumber: string | null;
}

/** Load the tenant's Twilio credentials (masked by never returning the token). */
export async function getTwilioConfig(
  userId: string,
  deps?: TwilioWhatsAppDeps,
): Promise<{ configured: boolean; accountSid: string | null; phoneNumber: string | null }> {
  const { prisma } = resolveDeps(deps);
  const user = (await prisma.user.findUnique({
    where: { id: userId },
    select: {
      twilioAccountSid: true,
      twilioAuthToken: true,
      twilioPhoneNumber: true,
    },
  })) as TwilioUserRow | null;

  const configured =
    !!user &&
    !!user.twilioAccountSid &&
    !!user.twilioAuthToken &&
    !!user.twilioPhoneNumber;

  return {
    configured,
    accountSid: user?.twilioAccountSid ?? null,
    phoneNumber: user?.twilioPhoneNumber ?? null,
  };
}

/**
 * Send a message through the tenant's Twilio WhatsApp number.
 * Returns false (never throws) when Twilio is missing or the API rejects.
 */
export async function sendTwilioWhatsAppMessage(
  userId: string,
  to: string,
  message: string,
  deps?: TwilioWhatsAppDeps,
): Promise<boolean> {
  const { prisma, fetchImpl } = resolveDeps(deps);

  const config = await getTwilioConfig(userId, deps);
  if (!config.configured) {
    console.log('Twilio not configured; WhatsApp marketing send skipped');
    return false;
  }

  const row = (await prisma.user.findUnique({
    where: { id: userId },
    select: { twilioAccountSid: true, twilioAuthToken: true, twilioPhoneNumber: true },
  })) as TwilioUserRow | null;
  if (!row) return false;

  try {
    const fromNumber = row.twilioPhoneNumber!.startsWith('whatsapp:')
      ? row.twilioPhoneNumber!
      : `whatsapp:${row.twilioPhoneNumber!}`;
    const toNumber = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;

    const authHeader = Buffer.from(
      `${row.twilioAccountSid}:${row.twilioAuthToken}`,
    ).toString('base64');

    const formData = new URLSearchParams();
    formData.append('From', fromNumber);
    formData.append('To', toNumber);
    formData.append('Body', message);

    const response = await fetchImpl(
      `https://api.twilio.com/2010-04-01/Accounts/${row.twilioAccountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${authHeader}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData.toString(),
      },
    );

    const data = await response.json();

    if (!response.ok) {
      console.error('Twilio marketing send error:', data);
      return false;
    }

    await prisma.whatsAppMessage.create({
      data: {
        userId,
        phone: toNumber,
        message,
        direction: 'OUTGOING',
        status: 'SENT',
        provider: 'twilio',
        twilioSid: data.sid || null,
      },
    });
    return true;
  } catch (error) {
    console.error('Error sending Twilio marketing message:', error);
    return false;
  }
}