
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, getAdminUser, logAdminAction } from '@/lib/admin';
import { prisma } from '@/lib/db';
export const dynamic = 'force-dynamic';


export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();
    const admin = await getAdminUser();
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
    
    const { id } = await params;
    
    await prisma.user.update({
      where: { id },
      data: {
        isActive: true,
        suspendedAt: null,
        suspendedReason: null,
      },
    });
    
    // Log action
    await logAdminAction(
      admin.id,
      'REACTIVATE_USER',
      id,
      {},
      request
    );
    
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Admin reactivate user API error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to reactivate user' },
      { status: 500 }
    );
  }
}
