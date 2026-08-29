import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/migrate
 * Run prisma db push to sync database schema
 * Only accessible by admin users
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is admin
    const user = session.user as any;
    if (user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    // Run prisma db push
    const { stdout, stderr } = await execAsync('npx prisma db push --skip-generate', {
      timeout: 60000, // 60 seconds timeout
    });

    return NextResponse.json({
      success: true,
      message: 'Database schema synced successfully',
      output: stdout,
      errors: stderr || null,
    });
  } catch (error) {
    console.error('Migration error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Migration failed',
    }, { status: 500 });
  }
}