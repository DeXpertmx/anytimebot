
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

// POST: Send WhatsApp message via Twilio
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
    const { to, message } = body;

    if (!to || !message) {
      return NextResponse.json(
        { error: 'Missing required fields: to, message' },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: {
        id: true,
        twilioAccountSid: true,
        twilioAuthToken: true,
        twilioPhoneNumber: true,
      },
    });

    if (!user?.twilioAccountSid || !user?.twilioAuthToken || !user?.twilioPhoneNumber) {
      return NextResponse.json(
        { error: 'Twilio not configured' },
        { status: 400 }
      );
    }

    // Format phone numbers for WhatsApp
    const fromNumber = user.twilioPhoneNumber.startsWith('whatsapp:') 
      ? user.twilioPhoneNumber 
      : `whatsapp:${user.twilioPhoneNumber}`;
    
    const toNumber = to.startsWith('whatsapp:') 
      ? to 
      : `whatsapp:${to}`;

    // Send message via Twilio API
    const authHeader = Buffer.from(
      `${user.twilioAccountSid}:${user.twilioAuthToken}`
    ).toString('base64');

    const formData = new URLSearchParams();
    formData.append('From', fromNumber);
    formData.append('To', toNumber);
    formData.append('Body', message);

    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${user.twilioAccountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${authHeader}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData.toString(),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error('Twilio send error:', data);
      return NextResponse.json(
        { 
          error: 'Failed to send message',
          details: data.message || 'Unknown error',
        },
        { status: response.status }
      );
    }

    // Save message to database
    await prisma.whatsAppMessage.create({
      data: {
        userId: user.id,
        phone: toNumber,
        message: message,
        direction: 'OUTGOING',
        status: 'SENT',
        provider: 'twilio',
        twilioSid: data.sid,
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Message sent successfully',
      sid: data.sid,
      status: data.status,
    });
  } catch (error) {
    console.error('Error sending Twilio message:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
