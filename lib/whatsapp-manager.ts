/**
 * WhatsApp connection manager.
 *
 * This layer encapsulates the connection lifecycle of the platform-managed
 * WhatsApp messaging service. It deliberately exposes ONLY neutral product
 * terms ("WhatsApp", "connection", "number") to the rest of the application.
 * All infrastructure/tooling names are kept here and never surface in the UI.
 */

import { prisma as defaultPrisma } from '@/lib/db';

// Injectable dependencies (used by tests). When not provided, the app-wide
// defaults are used so practical callers keep the exact same behaviour.
export interface WhatsAppManagerDeps {
  prisma?: typeof defaultPrisma;
  fetchImpl?: typeof fetch;
}

function resolveDeps(deps?: WhatsAppManagerDeps) {
  return {
    prisma: deps?.prisma ?? defaultPrisma,
    fetchImpl: deps?.fetchImpl ?? fetch.bind(globalThis),
  };
}

/**
 * Base URL of the managed messaging infrastructure.
 * Used by the webhook registration AND by outbound message senders.
 */
export function getWhatsAppBaseUrl(): string {
  return process.env.EVOLUTION_BASE_URL || '';
}

/**
 * Global infrastructure key used to manage every connection for every user.
 */
export function getWhatsAppGlobalApiKey(): string {
  return process.env.EVOLUTION_GLOBAL_API_KEY || '';
}

interface GlobalServerOptions {
  baseUrl: string;
  apiKey: string;
}

function options(): GlobalServerOptions {
  const baseUrl = getWhatsAppBaseUrl();
  const apiKey = getWhatsAppGlobalApiKey();
  if (!baseUrl || !apiKey) {
    throw new Error('WhatsApp messaging service is not configured');
  }
  return { baseUrl, apiKey };
}

/**
 * Generate a stable, unique instance name for a user.
 * The messaging service only accepts lower-case alphanumeric / dash / underscore names.
 */
export function buildInstanceName(userId: string, suffix = 0): string {
  const base = userId.replace(/[^a-zA-Z0-9]/g, '').slice(-20) || 'user';
  const ts = Date.now().toString(36);
  return `wa_${base}_${suffix}_${ts}`.toLowerCase();
}

export interface QrPayload {
  base64: string;
  code?: string | null;
  pairingCode?: string | null;
}

/**
 * Create a new WhatsApp instance for the given user.
 * - names and registers the instance with the managed service
 * - configures the inbound webhook so messages/Qr updates reach the app
 * - persists the connection metadata on the user
 *
 * Returns the instance name created.
 */
export async function createWhatsAppConnection(
  userId: string,
  publicOrigin?: string,
  deps?: WhatsAppManagerDeps,
): Promise<{ instanceName: string }> {
  const { prisma, fetchImpl } = resolveDeps(deps);
  const { baseUrl, apiKey } = options();
  const instanceName = buildInstanceName(userId);

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
    throw new Error(`Failed to create WhatsApp instance (${createRes.status}): ${text}`);
  }

  // Configure inbound webhook so messages and QR updates reach the app.
  const origin = publicOrigin || getWebhookOrigin();
  const webhookUrl = `${origin}/api/webhooks/evolution`;

  await setWebhook(instanceName, [webhookUrl], ['MESSAGES_UPSERT', 'QRCODE_UPDATED', 'CONNECTION_UPDATE'], apiKey, baseUrl, fetchImpl);

  await prisma.user.update({
    where: { id: userId },
    data: {
      whatsappProvider: 'evolution',
      whatsappEnabled: true,
      evolutionInstanceName: instanceName,
      evolutionApiUrl: baseUrl,
      evolutionApiKey: apiKey,
    } as any,
  });

  return { instanceName };
}

/**
 * Get the current QR code to pair/scan with a phone.
 * Returns the QR as a base64 PNG data URI suitable for <img src=... />.
 */
export async function getWhatsAppQr(userId: string, deps?: WhatsAppManagerDeps): Promise<QrPayload | null> {
  const { prisma, fetchImpl } = resolveDeps(deps);
  const { baseUrl, apiKey } = options();
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { evolutionInstanceName: true },
  });

  const instanceName = user?.evolutionInstanceName;
  if (!instanceName) return null;

  const res = await fetchImpl(`${baseUrl}/instance/connect/${instanceName}`, {
    method: 'GET',
    headers: { apikey: apiKey },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to obtain WhatsApp QR (${res.status}): ${text}`);
  }

  const data = await res.json();
  return {
    base64: data?.base64 || '',
    code: data?.code || null,
    pairingCode: data?.pairingCode || null,
  };
}

/**
 * Get the connection state for the user's instance.
 * Returns a neutral status object.
 */
export async function getWhatsAppConnectionState(
  userId: string,
  deps?: WhatsAppManagerDeps,
): Promise<{
  success: boolean;
  connected: boolean;
  state: string;
  hasInstance: boolean;
}> {
  const { prisma, fetchImpl } = resolveDeps(deps);
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { evolutionInstanceName: true },
  });

  const instanceName = user?.evolutionInstanceName;
  if (!instanceName) {
    return { success: true, connected: false, state: 'not_created', hasInstance: false };
  }

  const { baseUrl, apiKey } = options();

  try {
    const res = await fetchImpl(`${baseUrl}/instance/connectionState/${instanceName}`, {
      method: 'GET',
      headers: { apikey: apiKey },
    });

    if (!res.ok) {
      // 404 means instance doesn't exist -> treat as not connected
      if (res.status === 404) {
        return { success: true, connected: false, state: 'not_found', hasInstance: true };
      }
      const text = await res.text();
      throw new Error(`Failed to get WhatsApp status (${res.status}): ${text}`);
    }

    const data = await res.json();
    const rawState = data?.state || data?.instance?.state || 'unknown';
    const state = String(rawState).toLowerCase();
    const connected = ['open', 'connected'].includes(state);
    return { success: true, connected, state, hasInstance: true };
  } catch (e) {
    return { success: false, connected: false, state: 'error', hasInstance: true };
  }
}

/**
 * Disconnect / log out the current WhatsApp session, keeping the instance.
 */
export async function disconnectWhatsAppInstance(userId: string, deps?: WhatsAppManagerDeps): Promise<void> {
  const { prisma, fetchImpl } = resolveDeps(deps);
  const { baseUrl, apiKey } = options();
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { evolutionInstanceName: true },
  });
  const instanceName = user?.evolutionInstanceName;
  if (!instanceName) return;

  await fetchImpl(`${baseUrl}/instance/logout/${instanceName}`, {
    method: 'DELETE',
    headers: { apikey: apiKey },
  });
}

/**
 * Permanently delete the user's WhatsApp instance and reset their config.
 */
export async function deleteWhatsAppInstance(userId: string, deps?: WhatsAppManagerDeps): Promise<void> {
  const { prisma, fetchImpl } = resolveDeps(deps);
  const { baseUrl, apiKey } = options();
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { evolutionInstanceName: true },
  });
  const instanceName = user?.evolutionInstanceName;
  if (instanceName) {
    await fetchImpl(`${baseUrl}/instance/delete/${instanceName}`, {
      method: 'DELETE',
      headers: { apikey: apiKey },
    });
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      whatsappEnabled: false,
      evolutionInstanceName: null,
      evolutionApiUrl: null,
      evolutionApiKey: null,
    } as any,
  });
}

// --- lower level helpers ---------------------------------------------------

async function setWebhook(
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
    throw new Error(`Failed to configure WhatsApp webhook (${res.status}): ${text}`);
  }
}

function getWebhookOrigin(): string {
  const v = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || '';
  return v.replace(/\/$/, '');
}