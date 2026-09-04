import { NextRequest, NextResponse } from 'next/server';
import { createHash, randomBytes } from 'crypto';
import { prisma } from '@/lib/db';

/**
 * Public API authentication for external integrations.
 *
 * Keys are generated as `atb_<32-byte-hex>` (68 chars total). Only the
 * SHA-256 hash is stored, so a database leak never exposes usable keys.
 * The `prefix` column stores the first 11 chars for display in the UI.
 */

export const API_KEY_PREFIX = 'atb_';

export function generateApiKey(): { key: string; hash: string; prefix: string } {
  const key = `${API_KEY_PREFIX}${randomBytes(32).toString('hex')}`;
  return {
    key,
    hash: hashApiKey(key),
    prefix: key.slice(0, API_KEY_PREFIX.length + 7), // "atb_XXXXXXX"
  };
}

export function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

export interface AuthenticatedUser {
  userId: string;
  apiKeyId: string;
}

/**
 * Validate a request's `Authorization: Bearer atb_...` header.
 * Returns the owning user + key record, or null when missing/invalid/revoked.
 * Updates lastUsedAt / requestCount (fire-and-forget, non-blocking).
 */
export async function authenticateApiKey(
  request: NextRequest
): Promise<AuthenticatedUser | null> {
  const authHeader = request.headers.get('authorization') || '';
  if (!authHeader.startsWith('Bearer ')) return null;

  const key = authHeader.slice(7).trim();
  if (!key.startsWith(API_KEY_PREFIX) || key.length < API_KEY_PREFIX.length + 32) {
    return null;
  }

  const hash = hashApiKey(key);
  const apiKey = await prisma.apiKey.findUnique({
    where: { keyHash: hash },
    select: { id: true, userId: true, revokedAt: true },
  });

  if (!apiKey || apiKey.revokedAt) return null;

  // Usage tracking — never block the request on this.
  prisma.apiKey
    .update({
      where: { id: apiKey.id },
      data: { lastUsedAt: new Date(), requestCount: { increment: 1 } },
    })
    .catch(() => {});

  return { userId: apiKey.userId, apiKeyId: apiKey.id };
}

/** Standard JSON error responses for the public API. */
export function apiErrorResponse(
  status: 401 | 403 | 404 | 400 | 429 | 500,
  error: string,
  message?: string
) {
  return NextResponse.json({ success: false, error, message }, { status });
}
