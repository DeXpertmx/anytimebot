export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getAdminUser } from '@/lib/admin';
import { prisma } from '@/lib/db';

/**
 * GET /api/admin/logs?action=SET_EMAIL_SMTP&limit=50&cursor=...
 * Returns the admin audit log (newest first) with the acting admin's email,
 * filtered by action when provided. Admin-only.
 */
export async function GET(request: NextRequest) {
  try {
    const admin = await getAdminUser();
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const action = searchParams.get('action') || '';
    const rawLimit = parseInt(searchParams.get('limit') || '50', 10);
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 200) : 50;
    const cursor = searchParams.get('cursor') || '';

    const where = {
      ...(action ? { action } : {}),
      ...(cursor ? { createdAt: { lt: new Date(cursor) } } : {}),
    };

    const [logs, total] = await Promise.all([
      prisma.adminAuditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        include: {
          admin: { select: { email: true, name: true } },
        },
      }),
      prisma.adminAuditLog.count({ where: action ? { action } : {} }),
    ]);

    return NextResponse.json({
      logs: logs.map((entry) => ({
        id: entry.id,
        action: entry.action,
        details: entry.details,
        ipAddress: entry.ipAddress,
        adminEmail: entry.admin.email,
        adminName: entry.admin.name,
        createdAt: entry.createdAt,
      })),
      total,
      nextCursor: logs.length === limit ? logs[logs.length - 1].createdAt.toISOString() : null,
    });
  } catch (error: any) {
    console.error('Error al leer los registros de auditoría:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'No se pudieron leer los registros de auditoría' },
      { status: 500 },
    );
  }
}