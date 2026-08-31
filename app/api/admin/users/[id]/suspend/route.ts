
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
    const { reason } = await request.json();
    
    await prisma.user.update({
      where: { id },
      data: {
        isActive: false,
        suspendedAt: new Date(),
        suspendedReason: reason,
      },
    });
    
    // Log action
    await logAdminAction(
      admin.id,
      'SUSPEND_USER',
      id,
      { reason },
      request
    );
    
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Admin suspend user API error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to suspend user' },
      { status: 500 }
    );
  }
}
