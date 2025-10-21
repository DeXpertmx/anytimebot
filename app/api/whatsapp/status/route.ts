
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getInstanceStatus } from '@/lib/evolution-api';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user's Evolution API credentials
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: {
        evolutionApiUrl: true,
        evolutionApiKey: true,
        evolutionInstanceName: true,
      },
    });

    if (!user || !user.evolutionApiUrl || !user.evolutionApiKey || !user.evolutionInstanceName) {
      return NextResponse.json(
        { error: 'Evolution API credentials not configured' },
        { status: 400 }
      );
    }

    const credentials = {
      apiUrl: user.evolutionApiUrl,
      apiKey: user.evolutionApiKey,
      instanceName: user.evolutionInstanceName,
    };

    const result = await getInstanceStatus(credentials);
    
    return NextResponse.json(result);
  } catch (error) {
    console.error('Error getting WhatsApp status:', error);
    return NextResponse.json(
      { error: 'Failed to get WhatsApp status' },
      { status: 500 }
    );
  }
}
