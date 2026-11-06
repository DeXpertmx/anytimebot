export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getAdminUser, logAdminAction } from '@/lib/admin';
import {
  clearLlmCredentials,
  getLlmCredentialStatus,
  saveLlmCredentials,
  type LlmProviderPreference,
  type StoredLlmCredentials,
} from '@/lib/llm-credentials';

const PROVIDERS = ['deepseek', 'orcarouter'] as const;

/**
 * GET /api/admin/llm-credentials
 * Masked status of the AI providers (never returns a key).
 */
export async function GET() {
  const admin = await getAdminUser();
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return NextResponse.json(await getLlmCredentialStatus());
}

/**
 * POST /api/admin/llm-credentials
 * Body: { provider?: 'deepseek' | 'orcarouter' | 'auto',
 *         deepseek?: { apiKey?, model? }, orcarouter?: { apiKey?, model? } }
 * Empty fields keep the stored value.
 */
export async function POST(request: NextRequest) {
  try {
    const admin = await getAdminUser();
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const rawProvider: unknown = body.provider;
    if (
      rawProvider !== undefined &&
      rawProvider !== 'deepseek' &&
      rawProvider !== 'orcarouter' &&
      rawProvider !== 'auto'
    ) {
      return NextResponse.json({ error: 'Invalid provider' }, { status: 400 });
    }

    const patch: StoredLlmCredentials = {};
    if (rawProvider !== undefined) {
      patch.provider = rawProvider as LlmProviderPreference;
    }

    for (const id of PROVIDERS) {
      const incoming: unknown = body[id];
      if (typeof incoming !== 'object' || incoming === null) continue;
      const entry: { apiKey?: string; model?: string } = {};
      const apiKey = (incoming as Record<string, unknown>).apiKey;
      const model = (incoming as Record<string, unknown>).model;
      if (typeof apiKey === 'string') entry.apiKey = apiKey;
      if (typeof model === 'string') entry.model = model;
      if (Object.keys(entry).length > 0) patch[id] = entry;
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: 'No credentials provided' }, { status: 400 });
    }

    await saveLlmCredentials(patch);
    await logAdminAction(
      admin.id,
      'SET_LLM_CREDENTIALS',
      null,
      {
        provider: patch.provider ?? null,
        fields: {
          deepseek: Object.keys(patch.deepseek ?? {}),
          orcarouter: Object.keys(patch.orcarouter ?? {}),
        },
      },
      request,
    );

    return NextResponse.json(await getLlmCredentialStatus());
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to save LLM credentials' },
      { status: 500 },
    );
  }
}

/** DELETE /api/admin/llm-credentials — removes the stored keys (env still applies). */
export async function DELETE(request: NextRequest) {
  try {
    const admin = await getAdminUser();
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    await clearLlmCredentials();
    await logAdminAction(admin.id, 'CLEAR_LLM_CREDENTIALS', null, {}, request);
    return NextResponse.json(await getLlmCredentialStatus());
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to clear LLM credentials' },
      { status: 500 },
    );
  }
}
