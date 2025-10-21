
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

// POST: Test Twilio connection
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: {
        twilioAccountSid: true,
        twilioAuthToken: true,
        twilioPhoneNumber: true,
      },
    });

    if (!user?.twilioAccountSid || !user?.twilioAuthToken) {
      return NextResponse.json(
        { error: 'Twilio not configured' },
        { status: 400 }
      );
    }

    // Test connection by fetching account details
    const authHeader = Buffer.from(
      `${user.twilioAccountSid}:${user.twilioAuthToken}`
    ).toString('base64');

    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${user.twilioAccountSid}.json`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Basic ${authHeader}`,
        },
      }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error('Twilio API error:', error);
      return NextResponse.json(
        { 
          error: 'Invalid credentials or API error',
          details: error,
        },
        { status: 400 }
      );
    }

    const account = await response.json();

    return NextResponse.json({
      success: true,
      message: 'Connection successful',
      account: {
        sid: account.sid,
        friendlyName: account.friendly_name,
        status: account.status,
      },
    });
  } catch (error) {
    console.error('Error testing Twilio connection:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
