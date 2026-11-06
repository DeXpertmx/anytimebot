export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getAdminUser } from '@/lib/admin';
import { getLlmCredentials, type LlmProviderId } from '@/lib/llm-credentials';

const DEEPSEEK_URL = process.env.LLM_BASE_URL || 'https://api.deepseek.com/chat/completions';
const ORCAROUTER_URL =
  process.env.ORCAROUTER_BASE_URL || 'https://api.orcarouter.ai/v1/chat/completions';

/**
 * POST /api/admin/llm-credentials/test
 * Body: { provider?: 'deepseek' | 'orcarouter' }
 * Sends a one-word prompt with the saved key so the admin can confirm the
 * credentials work without leaving the panel. The key is never echoed back.
 */
export async function POST(request: NextRequest) {
  const admin = await getAdminUser();
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const requested: unknown = body.provider;
  const credentials = await getLlmCredentials();

  const providerId: LlmProviderId =
    requested === 'deepseek' || requested === 'orcarouter'
      ? requested
      : credentials.orcarouter.apiKey
        ? 'orcarouter'
        : 'deepseek';

  const config = credentials[providerId];
  if (!config.apiKey) {
    return NextResponse.json(
      { error: `No hay API key configurada para ${providerId}` },
      { status: 400 },
    );
  }

  const url = providerId === 'deepseek' ? DEEPSEEK_URL : ORCAROUTER_URL;
  const startedAt = Date.now();

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages: [{ role: 'user', content: 'Responde solo: ok' }],
        max_tokens: 16,
        temperature: 0,
      }),
      signal: AbortSignal.timeout(20000),
    });

    const latencyMs = Date.now() - startedAt;

    if (!response.ok) {
      const details = (await response.text()).slice(0, 300);
      return NextResponse.json(
        { error: `HTTP ${response.status}: ${details}`, provider: providerId, latencyMs },
        { status: 502 },
      );
    }

    const data: any = await response.json();
    const reply = data?.choices?.[0]?.message?.content;

    return NextResponse.json({
      ok: true,
      provider: providerId,
      model: config.model,
      latencyMs,
      reply: typeof reply === 'string' ? reply.trim().slice(0, 120) : null,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        error: `${error?.name || 'Error'}: ${error?.message || String(error)}`,
        provider: providerId,
        latencyMs: Date.now() - startedAt,
      },
      { status: 502 },
    );
  }
}
