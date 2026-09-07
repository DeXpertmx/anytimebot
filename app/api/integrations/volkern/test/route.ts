import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

const TIMEOUT_MS = 12_000;

/**
 * POST /api/integrations/volkern/test
 * Validates the configured Volkern REST API key by calling the public API
 * (GET /api/leads?limit=1 with x-api-key). Reports the HTTP status so the user
 * can confirm the key and the tenant are correct. Does not create any record.
 */
export async function POST(_request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true },
    });
    if (!user) {
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
    }

    const integration = await prisma.volkernIntegration.findUnique({
      where: { userId: user.id },
    });
    if (!integration || !integration.activo) {
      return NextResponse.json(
        { success: false, error: 'La integración con Volkern no está configurada o está inactiva' },
        { status: 400 },
      );
    }
    if (!integration.apiKey) {
      return NextResponse.json(
        {
          success: false,
          error:
            'No hay API key configurada. Crea una API key en tu cuenta de Volkern (Configuración → API) y guárdala aquí.',
        },
        { status: 400 },
      );
    }

    const baseUrl = integration.baseUrl.replace(/\/$/, '');
    const startedAt = Date.now();
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      const response = await fetch(`${baseUrl}/api/leads?limit=1`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': integration.apiKey,
          'User-Agent': 'Anytimebot-Volkern/1.0',
        },
        signal: controller.signal,
      });
      clearTimeout(timer);
      const durationMs = Date.now() - startedAt;
      const bodyPreview = (await response.text().catch(() => '')).slice(0, 300);
      const ok = response.status >= 200 && response.status < 300;

      return NextResponse.json({
        success: ok,
        status: response.status,
        durationMs,
        bodyPreview: bodyPreview || undefined,
        message: ok
          ? 'API key válida: Volkern responde correctamente para tu tenant.'
          : response.status === 401
            ? 'API key inválida o sin permisos (leads:read). Verifica la key en Volkern → Configuración → API.'
            : `Volkern respondió con estado ${response.status}.`,
      });
    } catch (netError) {
      const isAbort = netError instanceof Error && netError.name === 'AbortError';
      return NextResponse.json({
        success: false,
        error: isAbort
          ? `No response within ${TIMEOUT_MS / 1000}s`
          : netError instanceof Error
            ? netError.message
            : String(netError),
        durationMs: Date.now() - startedAt,
      });
    }
  } catch (error) {
    console.error('Error testing Volkern integration:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
