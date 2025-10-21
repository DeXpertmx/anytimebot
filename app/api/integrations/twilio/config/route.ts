
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

// GET: Get Twilio configuration
export async function GET(req: NextRequest) {
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
        twilioPhoneNumber: true,
        whatsappProvider: true,
        whatsappEnabled: true,
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Return config but mask auth token for security
    return NextResponse.json({
      accountSid: user.twilioAccountSid || '',
      phoneNumber: user.twilioPhoneNumber || '',
      hasAuthToken: !!user.twilioAccountSid, // Just indicate if token exists
      provider: user.whatsappProvider || 'evolution',
      enabled: user.whatsappEnabled || false,
    });
  } catch (error) {
    console.error('Error fetching Twilio config:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST: Save Twilio configuration
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { accountSid, authToken, phoneNumber, provider } = body;

    // Validate required fields
    if (!accountSid || !authToken || !phoneNumber) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Validate phone number format (should start with whatsapp:)
    const formattedPhone = phoneNumber.startsWith('whatsapp:') 
      ? phoneNumber 
      : `whatsapp:${phoneNumber}`;

    // Update user with Twilio credentials
    const user = await prisma.user.update({
      where: { email: session.user.email },
      data: {
        twilioAccountSid: accountSid,
        twilioAuthToken: authToken,
        twilioPhoneNumber: formattedPhone,
        whatsappProvider: provider || 'twilio',
        whatsappEnabled: true,
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Twilio configuration saved successfully',
    });
  } catch (error) {
    console.error('Error saving Twilio config:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE: Remove Twilio configuration
export async function DELETE(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    await prisma.user.update({
      where: { email: session.user.email },
      data: {
        twilioAccountSid: null,
        twilioAuthToken: null,
        twilioPhoneNumber: null,
        whatsappProvider: 'evolution',
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Twilio configuration removed successfully',
    });
  } catch (error) {
    console.error('Error removing Twilio config:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
