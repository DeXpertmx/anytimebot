
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
    
    await prisma.usage.update({
      where: { userId: id },
      data: {
        aiInteractions: 0,
        videoMinutes: 0,
        whatsappMessages: 0,
        telegramMessages: 0,
        lastResetAt: new Date(),
      },
    });
    
    // Log action
    await logAdminAction(
      admin.id,
      'RESET_USAGE',
      id,
      {},
      request
    );
    
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Admin reset usage API error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to reset usage' },
      { status: 500 }
    );
  }
}
