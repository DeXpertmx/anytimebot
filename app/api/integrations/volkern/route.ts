import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

// GET /api/integrations/volkern — current Volkern CRM integration config
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true, username: true },
    });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const integration = await prisma.volkernIntegration.findUnique({
      where: { userId: user.id },
    });

    return NextResponse.json({
      configured: !!integration,
      integration: integration
        ? {
            baseUrl: integration.baseUrl,
            username: integration.username,
            hasWebhookSecret: !!integration.webhookSecret,
            activo: integration.activo,
            sincronizarCitas: integration.sincronizarCitas,
            sincronizarMensajes: integration.sincronizarMensajes,
            totalCitasSincronizadas: integration.totalCitasSincronizadas,
            totalMensajesSincronizados: integration.totalMensajesSincronizados,
            ultimaSincronizacion: integration.ultimaSincronizacion,
          }
        : null,
      // Default username suggestion for the form
      defaultUsername: user.username || '',
    });
  } catch (error) {
    console.error('Error fetching Volkern config:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/integrations/volkern — create/update the integration config
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true, username: true },
    });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const body = await req.json();
    const baseUrl = typeof body.baseUrl === 'string' ? body.baseUrl.trim().replace(/\/$/, '') : 'https://volkern.app';
    const username = typeof body.username === 'string' && body.username.trim()
      ? body.username.trim()
      : (user.username || user.id);
    const webhookSecret = typeof body.webhookSecret === 'string' && body.webhookSecret.trim()
      ? body.webhookSecret.trim()
      : null;

    // Validate baseUrl is http(s)
    if (!/^https?:\/\//.test(baseUrl)) {
      return NextResponse.json(
        { error: 'La URL debe comenzar con http:// o https://' },
        { status: 400 },
      );
    }

    const integration = await prisma.volkernIntegration.upsert({
      where: { userId: user.id },
      update: {
        baseUrl,
        username,
        webhookSecret,
        activo: body.activo !== false,
        sincronizarCitas: body.sincronizarCitas !== false,
        sincronizarMensajes: body.sincronizarMensajes !== false,
      },
      create: {
        userId: user.id,
        baseUrl,
        username,
        webhookSecret,
        activo: body.activo !== false,
        sincronizarCitas: body.sincronizarCitas !== false,
        sincronizarMensajes: body.sincronizarMensajes !== false,
      },
    });

    return NextResponse.json({
      success: true,
      integration: {
        baseUrl: integration.baseUrl,
        username: integration.username,
        hasWebhookSecret: !!integration.webhookSecret,
        activo: integration.activo,
        sincronizarCitas: integration.sincronizarCitas,
        sincronizarMensajes: integration.sincronizarMensajes,
      },
    });
  } catch (error) {
    console.error('Error saving Volkern config:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/integrations/volkern — disconnect the integration
export async function DELETE() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true },
    });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    await prisma.volkernIntegration.deleteMany({ where: { userId: user.id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error disconnecting Volkern:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}