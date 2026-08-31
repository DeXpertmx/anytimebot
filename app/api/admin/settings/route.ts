
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, getAdminUser, logAdminAction } from '@/lib/admin';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    await requireAdmin();
    const admin = await getAdminUser();
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
    
    const settings = await request.json();
    
    // Log the settings change
    await logAdminAction(
      admin.id,
      'UPDATE_SETTINGS',
      null,
      settings,
      request
    );
    
    // In a real implementation, you would save these settings to a database
    // For now, we'll just acknowledge the request
    
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Admin settings API error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update settings' },
      { status: 500 }
    );
  }
}
