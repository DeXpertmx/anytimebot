
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, getAdminUser, logAdminAction } from '@/lib/admin';
import { prisma } from '@/lib/db';
export const dynamic = 'force-dynamic';

import { updateUserPlanQuotas } from '@/lib/plans';

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
    const { plan } = await request.json();
    
    if (!['FREE', 'PRO', 'TEAM', 'ENTERPRISE'].includes(plan)) {
      return NextResponse.json({ error: 'Invalid plan' }, { status: 400 });
    }
    
    // Update user plan and quotas
    await updateUserPlanQuotas(id, plan);
    
    // Log action
    await logAdminAction(
      admin.id,
      'CHANGE_PLAN',
      id,
      { newPlan: plan },
      request
    );
    
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Admin change plan API error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to change plan' },
      { status: 500 }
    );
  }
}
