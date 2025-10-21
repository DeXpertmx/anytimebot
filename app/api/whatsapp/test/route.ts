
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { sendWhatsAppMessage } from '@/lib/evolution-api';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function POST(req: Request) {
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

    const { phone, message } = await req.json();

    if (!phone || !message) {
      return NextResponse.json(
        { error: 'Phone number and message are required' },
        { status: 400 }
      );
    }

    const result = await sendWhatsAppMessage({ 
      credentials, 
      number: phone, 
      text: message 
    });
    
    return NextResponse.json(result);
  } catch (error) {
    console.error('Error sending test message:', error);
    return NextResponse.json(
      { error: 'Failed to send test message' },
      { status: 500 }
    );
  }
}
