/**
 * System WhatsApp connection (Anytimebot-exclusive notification number).
 *
 * Anytimebot keeps its own WhatsApp number, managed through the same messaging
 * infrastructure as tenant numbers, used to send platform notifications:
 * booking confirmations, appointment reminders, feedback surveys, etc. This
 * layer exposes ONLY neutral product terms ("WhatsApp", "notification number",
 * "connection") — infrastructure/tooling names never leave this file.
 *
 * The connection metadata is persisted in the `SystemSetting` table under the
 * key "system_whatsapp". Dependencies (prisma, fetch) are injectable so the
 * layer stays unit-testable.
 */

import type { Prisma } from '@prisma/client';
import { prisma as defaultPrisma } from '@/lib/db';
import { getWhatsAppBaseUrl, getWhatsAppGlobalApiKey } from '@/lib/whatsapp-manager';

export const SYSTEM_WHATSAPP_KEY = 'system_whatsapp';
export const SYSTEM_WHATSAPP_INSTANCE = 'anytimebot_system';

export interface SystemWhatsAppConfig {
  instanceName: string;
  phone?: string | null;
  enabled: boolean;
  connectedAt?: string | null;
  updatedBy?: string | null;
  /** Phone that receives platform notifications (e.g. new signups). */
  adminPhone?: string | null;
}

export interface SystemWhatsAppDeps {
  prisma?: typeof defaultPrisma;
  fetchImpl?: typeof fetch;
}

export interface QrPayload {
  base64: string;
  code?: string | null;
  pairingCode?: string | null;
}

function resolveDeps(deps?: SystemWhatsAppDeps) {
  return {
    prisma: deps?.prisma ?? defaultPrisma,
    fetchImpl: deps?.fetchImpl ?? fetch.bind(globalThis),
  };
}

function infrastructure() {
  const baseUrl = getWhatsAppBaseUrl();
  const apiKey = getWhatsAppGlobalApiKey();
  if (!baseUrl || !apiKey) {
    throw new Error('WhatsApp messaging service is not configured');
  }
  return { baseUrl, apiKey };
}

/** Read the persisted system WhatsApp config, or null when never activated. */
export async function getSystemWhatsAppConfig(deps?: SystemWhatsAppDeps): Promise<SystemWhatsAppConfig | null> {
  const { prisma } = resolveDeps(deps);
  const row = await prisma.systemSetting.findUnique({
    where: { key: SYSTEM_WHATSAPP_KEY },
  });
  if (!row) return null;
  return (row.value as unknown as SystemWhatsAppConfig) ?? null;
}

async function saveSystemWhatsAppConfig(config: SystemWhatsAppConfig, deps?: SystemWhatsAppDeps): Promise<void> {
  const { prisma } = resolveDeps(deps);
  const value = config as unknown as Prisma.InputJsonValue;
  await prisma.systemSetting.upsert({
    where: { key: SYSTEM_WHATSAPP_KEY },
    create: { key: SYSTEM_WHATSAPP_KEY, value },
    update: { value },
  });
}

/**
 * Create (or re-register) the system WhatsApp instance and enable it.
 * - names/registers the exclusive Anytimebot instance
 * - configures the inbound webhook (harmless; inbound messages to this number
 *   are ignored by the app since no tenant owns the instance)
 * - persists the connection in system settings
 */
export async function activateSystemWhatsApp(
  publicOrigin?: string,
  updatedBy?: string | null,
  deps?: SystemWhatsAppDeps,
): Promise<{ instanceName: string }> {
  const { fetchImpl } = resolveDeps(deps);
  const { baseUrl, apiKey } = infrastructure();
  const instanceName = SYSTEM_WHATSAPP_INSTANCE;

  const createRes = await fetchImpl(`${baseUrl}/instance/create`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: apiKey,
    },
    body: JSON.stringify({
      instanceName,
      integration: 'WHATSAPP-BAILEYS',
      qrcode: true,
    }),
  });

  if (!createRes.ok) {
    const text = await createRes.text();
    // 409/400 often mean the instance already exists — treat as OK and reuse it.
    if (createRes.status !== 409 && createRes.status !== 400) {
      throw new Error(`Failed to create system WhatsApp instance (${createRes.status}): ${text}`);
    }
  }

  const origin = publicOrigin || getWebhookOrigin();
  const webhookUrl = `${origin}/api/webhooks/evolution`;
  await setSystemWebhook(instanceName, [webhookUrl], ['MESSAGES_UPSERT', 'QRCODE_UPDATED', 'CONNECTION_UPDATE'], apiKey, baseUrl, fetchImpl);

  await saveSystemWhatsAppConfig(
    {
      instanceName,
      enabled: true,
      phone: (await getSystemWhatsAppConfig(deps))?.phone ?? null,
      connectedAt: null,
      updatedBy: updatedBy ?? null,
    },
    deps,
  );

  return { instanceName };
}

/** Get the current QR (base64 PNG data URI) to pair the system number. */
export async function getSystemWhatsAppQr(deps?: SystemWhatsAppDeps): Promise<QrPayload | null> {
  const { fetchImpl } = resolveDeps(deps);
  const config = await getSystemWhatsAppConfig(deps);
  if (!config || !config.enabled) return null;

  const { baseUrl, apiKey } = infrastructure();
  const res = await fetchImpl(`${baseUrl}/instance/connect/${config.instanceName}`, {
    method: 'GET',
    headers: { apikey: apiKey },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to obtain system WhatsApp QR (${res.status}): ${text}`);
  }

  const data = await res.json();
  return {
    base64: data?.base64 || '',
    code: data?.code || null,
    pairingCode: data?.pairingCode || null,
  };
}

export interface SystemWhatsAppStatus {
  success: boolean;
  connected: boolean;
  state: string;
  hasInstance: boolean;
  configured: boolean;
  phone?: string | null;
  adminPhone?: string | null;
}

/** Connection state of the system number (neutral status object). */
export async function getSystemWhatsAppStatus(deps?: SystemWhatsAppDeps): Promise<SystemWhatsAppStatus> {
  const { fetchImpl } = resolveDeps(deps);
  const config = await getSystemWhatsAppConfig(deps);
  if (!config || !config.enabled) {
    return { success: true, connected: false, state: 'not_configured', hasInstance: false, configured: false };
  }

  const { baseUrl, apiKey } = infrastructure();
  try {
    const res = await fetchImpl(`${baseUrl}/instance/connectionState/${config.instanceName}`, {
      method: 'GET',
      headers: { apikey: apiKey },
    });

    if (!res.ok) {
      if (res.status === 404) {
        return { success: true, connected: false, state: 'not_found', hasInstance: true, configured: true, phone: config.phone, adminPhone: config.adminPhone ?? null };
      }
      return { success: false, connected: false, state: 'error', hasInstance: true, configured: true, phone: config.phone, adminPhone: config.adminPhone ?? null };
    }

    const data = await res.json();
    const rawState = data?.state || data?.instance?.state || 'unknown';
    const state = String(rawState).toLowerCase();
    const connected = ['open', 'connected'].includes(state);

    // Best-effort: discover the paired phone from the instance registry.
    let phone = config.phone ?? null;
    if (connected) {
      phone = await discoverSystemPhone(deps);
    }

    return { success: true, connected, state, hasInstance: true, configured: true, phone, adminPhone: config.adminPhone ?? null };
  } catch (e) {
    return { success: false, connected: false, state: 'error', hasInstance: true, configured: true, phone: config.phone, adminPhone: config.adminPhone ?? null };
  }
}

/** Try to read the paired number from the infrastructure instance registry. */
async function discoverSystemPhone(deps?: SystemWhatsAppDeps): Promise<string | null> {
  const { fetchImpl } = resolveDeps(deps);
  const { baseUrl, apiKey } = infrastructure();
  try {
    const res = await fetchImpl(`${baseUrl}/instance/fetchInstances`, {
      method: 'GET',
      headers: { apikey: apiKey },
    });
    if (!res.ok) return null;
    const list = await res.json();
    const rows = Array.isArray(list) ? list : list?.instances || [];
    // The registry exposes the instance identity under `name` (and sometimes `instanceName`).
    const mine = rows.find((r: any) => r?.name === SYSTEM_WHATSAPP_INSTANCE || r?.instanceName === SYSTEM_WHATSAPP_INSTANCE);
    const jid = mine?.ownerJid || mine?.jid || null;
    if (!jid) return null;
    const phone = String(jid).split('@')[0];
    if (!phone) return null;
    // Persist so we don't have to rediscover every time.
    const config = await getSystemWhatsAppConfig(deps);
    if (config && config.phone !== phone) {
      await saveSystemWhatsAppConfig({ ...config, phone }, deps);
    }
    return phone;
  } catch (e) {
    return null;
  }
}

/**
 * Log out (soft) or permanently delete (permanent) the system connection.
 * Logout keeps the instance so it can be re-paired; delete removes it entirely
 * and disables the system number.
 */
export async function disconnectSystemWhatsApp(permanent: boolean, deps?: SystemWhatsAppDeps): Promise<void> {
  const { fetchImpl } = resolveDeps(deps);
  const config = await getSystemWhatsAppConfig(deps);
  if (!config || !config.enabled) return;

  const { baseUrl, apiKey } = infrastructure();
  const path = permanent ? 'delete' : 'logout';
  await fetchImpl(`${baseUrl}/instance/${path}/${config.instanceName}`, {
    method: 'DELETE',
    headers: { apikey: apiKey },
  });

  if (permanent) {
    await saveSystemWhatsAppConfig({ ...config, enabled: false, connectedAt: null, phone: null }, deps);
  }
}

/**
 * Send a message from the Anytimebot notification number.
 * Returns false when the system number is not connected/configured.
 */
export async function sendSystemWhatsAppMessage(
  to: string,
  message: string,
  bookingId?: string,
  deps?: SystemWhatsAppDeps,
): Promise<boolean> {
  const { prisma, fetchImpl } = resolveDeps(deps);
  const config = await getSystemWhatsAppConfig(deps);
  if (!config || !config.enabled) {
    console.log('System WhatsApp not configured; skipping message');
    return false;
  }

  const { baseUrl, apiKey } = infrastructure();
  try {
    const res = await fetchImpl(`${baseUrl}/message/sendText/${config.instanceName}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: apiKey,
      },
      body: JSON.stringify({
        number: to.replace(/[^0-9]/g, ''),
        text: message,
      }),
    });

    if (!res.ok) {
      console.error('System WhatsApp send error:', await res.text());
      return false;
    }

    const data = await res.json();
    // Persist the outbound message (no tenant owner -> userId null).
    await prisma.whatsAppMessage.create({
      data: {
        userId: null,
        bookingId: bookingId ?? null,
        phone: to,
        message,
        direction: 'OUTGOING',
        status: 'SENT',
        provider: 'system',
        evolutionId: data?.key?.id || null,
      },
    });

    return true;
  } catch (error) {
    console.error('Error sending system WhatsApp message:', error);
    return false;
  }
}

/**
 * Set the phone that receives platform notifications to the admin.
 * Persisted in the system WhatsApp config.
 */
export async function setSystemWhatsAppAdminPhone(phone: string | null, deps?: SystemWhatsAppDeps): Promise<void> {
  const config = await getSystemWhatsAppConfig(deps);
  if (!config) return;
  await saveSystemWhatsAppConfig({ ...config, adminPhone: phone }, deps);
}

/**
 * Resolve the phone that should receive platform notifications:
 * 1. explicit adminPhone from config
 * 2. the ADMIN user's stored phone
 * 3. the connected system number (best effort)
 */
async function resolveAdminNotificationPhone(deps?: SystemWhatsAppDeps): Promise<string | null> {
  const { prisma } = resolveDeps(deps);
  const config = await getSystemWhatsAppConfig(deps);
  if (config?.adminPhone) return config.adminPhone;

  try {
    const admin = await prisma.user.findFirst({
      where: { role: 'ADMIN' },
      select: { phone: true },
    });
    if (admin?.phone) return admin.phone;
  } catch (e) {
    console.error('Failed to resolve admin notification phone:', e);
  }

  return config?.phone ?? null;
}

/**
 * Notify the admin via the system WhatsApp number (e.g. a new signup).
 * Never throws — notifications are best-effort.
 */
export async function notifyAdminWhatsApp(
  message: string,
  deps?: SystemWhatsAppDeps,
): Promise<boolean> {
  try {
    const phone = await resolveAdminNotificationPhone(deps);
    if (!phone) {
      console.log('No admin notification phone configured; skipping admin WhatsApp notification');
      return false;
    }
    return sendSystemWhatsAppMessage(phone, message, undefined, deps);
  } catch (error) {
    console.error('Failed to send admin WhatsApp notification:', error);
    return false;
  }
}

/** Convenience: notify the admin that a new user registered. */
export async function notifyAdminNewSignup(
  user: { name?: string | null; email: string; username?: string | null },
  deps?: SystemWhatsAppDeps,
): Promise<boolean> {
  const date = new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid' });
  const message = `👋 *Nuevo registro en Anytimebot*

👤 ${user.name || '—'}
📧 ${user.email}
🔗 ${user.username || '—'}
🕐 ${date}`;
  return notifyAdminWhatsApp(message, deps);
}

function formatCurrency(amount: number, currency?: string | null): string {
  const code = (currency || 'EUR').toUpperCase();
  try {
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: code }).format(amount / 100);
  } catch (e) {
    return `${(amount / 100).toFixed(2)} ${code}`;
  }
}

function bookingDate(iso: string | Date, timezone?: string | null): string {
  return new Date(iso).toLocaleString('es-ES', { timeZone: timezone || 'Europe/Madrid' });
}

/** Format an admin-facing booking summary line (neutral product terms). */
function bookingSummary(data: {
  guestName?: string | null;
  guestEmail?: string | null;
  guestPhone?: string | null;
  eventTypeName: string;
  startTime: string | Date;
  timezone?: string | null;
}): string {
  return `📅 Tipo: ${data.eventTypeName}
👤 Cliente: ${data.guestName || '—'}${data.guestEmail ? `\n📧 ${data.guestEmail}` : ''}${data.guestPhone ? `\n📞 ${data.guestPhone}` : ''}\n🕐 Fecha y hora: ${bookingDate(data.startTime, data.timezone)}`;
}

/** Notify the admin of a newly paid booking via the system WhatsApp number. */
export async function notifyAdminNewPaidBooking(
  data: {
    guestName?: string | null;
    guestEmail?: string | null;
    guestPhone?: string | null;
    eventTypeName: string;
    startTime: string | Date;
    timezone?: string | null;
    amount?: number | null;
    currency?: string | null;
  },
  deps?: SystemWhatsAppDeps,
): Promise<boolean> {
  const amount = data.amount && data.amount > 0 ? `\n💰 Importe: ${formatCurrency(data.amount, data.currency)}` : '';
  const message = `✅ *Nueva reserva pagada en Anytimebot*

${bookingSummary(data)}${amount}`;
  return notifyAdminWhatsApp(message, deps);
}

/** Notify the admin of a cancelled booking via the system WhatsApp number. */
export async function notifyAdminBookingCancelled(
  data: {
    guestName?: string | null;
    guestEmail?: string | null;
    guestPhone?: string | null;
    eventTypeName: string;
    startTime: string | Date;
    timezone?: string | null;
  },
  deps?: SystemWhatsAppDeps,
): Promise<boolean> {
  const message = `❌ *Reserva cancelada en Anytimebot*

${bookingSummary(data)}`;
  return notifyAdminWhatsApp(message, deps);
}

/** Notify the admin of a refunded (paid) booking via the system WhatsApp number. */
export async function notifyAdminBookingRefunded(
  data: {
    guestName?: string | null;
    guestEmail?: string | null;
    guestPhone?: string | null;
    eventTypeName: string;
    startTime: string | Date;
    timezone?: string | null;
    amount?: number | null;
    currency?: string | null;
  },
  deps?: SystemWhatsAppDeps,
): Promise<boolean> {
  const amount = data.amount && data.amount > 0 ? `\n💰 Reembolsado: ${formatCurrency(data.amount, data.currency)}` : '';
  const message = `↩️ *Reembolso de reserva en Anytimebot*

${bookingSummary(data)}${amount}`;
  return notifyAdminWhatsApp(message, deps);
}

/** Booking confirmation sent from the Anytimebot notification number. */
export async function sendSystemBookingConfirmation(
  to: string,
  data: {
    guestName: string;
    eventTypeName: string;
    startTime: string;
    timezone: string;
    cancelUrl?: string;
    rescheduleUrl?: string;
  },
  deps?: SystemWhatsAppDeps,
): Promise<boolean> {
  const manageBlock =
    data.cancelUrl || data.rescheduleUrl
      ? `\n\n🔧 ¿Necesitas modificar o cancelar tu cita?\n${data.rescheduleUrl ? `🔄 Reprogramar: ${data.rescheduleUrl}\n` : ''}${data.cancelUrl ? `❌ Cancelar: ${data.cancelUrl}` : ''}`
      : '';
  const message = `¡Hola ${data.guestName}! 👋\n\nTu reunión ha sido confirmada:\n📅 Tipo: ${data.eventTypeName}\n🕐 Fecha y hora: ${data.startTime}\n🌍 Zona horaria: ${data.timezone}${manageBlock}\n\n¡Te esperamos!`;
  return sendSystemWhatsAppMessage(to, message, undefined, deps);
}

// --- low-level helpers ------------------------------------------------------

async function setSystemWebhook(
  instanceName: string,
  urls: string[],
  events: string[],
  apiKey: string,
  baseUrl: string,
  fetchImpl: typeof fetch,
): Promise<void> {
  const url = urls[0];
  const res = await fetchImpl(`${baseUrl}/webhook/set/${instanceName}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: apiKey },
    body: JSON.stringify({
      webhook: {
        enabled: true,
        url,
        webhook_by_events: false,
        events,
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to configure system WhatsApp webhook (${res.status}): ${text}`);
  }
}

function getWebhookOrigin(): string {
  const v = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || '';
  return v.replace(/\/$/, '');
}
