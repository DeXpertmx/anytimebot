import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

const TIMEOUT_MS = 12_000;

/**
 * POST /api/integrations/volkern/test
 *
 * mode: 'ping' -> reachability check against the configured instance
 *                 (GET {baseUrl}/api/health, no credentials).
 * mode: 'key'  (default) -> validates the stored Volkern REST API key by
 *                 calling the public API (GET /api/leads?limit=1 with x-api-key).
 *
 * Both run server-side (no browser CORS) and never create any record.
 */
export async function POST(request: NextRequest) {
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
      let mode = 'key';
      try {
        const body = await request.json();
        if (body && (body.mode === 'ping' || body.mode === 'key')) mode = body.mode;
      } catch {
        // body vacío -> modo por defecto (key)
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      const url = mode === 'ping' ? `${baseUrl}/api/health` : `${baseUrl}/api/leads?limit=1`;
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'User-Agent': 'Anytimebot-Volkern/1.0',
      };
      if (mode !== 'ping') headers['x-api-key'] = integration.apiKey ?? '';

      const response = await fetch(url, {
        method: 'GET',
        headers,
        signal: controller.signal,
      });
      clearTimeout(timer);
      const durationMs = Date.now() - startedAt;
      const bodyPreview = (await response.text().catch(() => '')).slice(0, 300);
      const ok = response.status >= 200 && response.status < 300;

      const message =
        mode === 'ping'
          ? ok
            ? 'Conexión correcta: tu instancia de Volkern responde.'
            : `La instancia de Volkern respondió con estado ${response.status}.`
          : ok
            ? 'API key válida: Volkern responde correctamente para tu tenant.'
            : response.status === 401
              ? 'API key inválida o sin permisos (leads:read). Verifica la key en Volkern → Configuración → API.'
              : `Volkern respondió con estado ${response.status}.`;

      return NextResponse.json({
        success: ok,
        mode,
        status: response.status,
        durationMs,
        bodyPreview: bodyPreview || undefined,
        message,
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
