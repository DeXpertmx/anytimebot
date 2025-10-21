
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, getAdminUser } from '@/lib/admin';
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
    const { note } = await request.json();
    
    await prisma.adminNote.create({
      data: {
        userId: id,
        adminEmail: admin.email,
        note,
      },
    });
    
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Admin add note API error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to add note' },
      { status: 500 }
    );
  }
}
