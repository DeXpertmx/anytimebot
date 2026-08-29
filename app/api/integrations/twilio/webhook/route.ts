import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { publishBotMessage } from '@/lib/convex-server';
import { generateBotResponse } from '@/lib/bot-response';

export const dynamic = 'force-dynamic';

// POST: Receive WhatsApp messages from Twilio webhook.
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const messageSid = String(formData.get('MessageSid') || '');
    const from = String(formData.get('From') || '');
    const to = String(formData.get('To') || '');
    const body = String(formData.get('Body') || '').trim();
    const accountSid = String(formData.get('AccountSid') || '');

    if (!messageSid || !from || !to || !body) {
      return NextResponse.json({ error: 'Missing required webhook fields' }, { status: 400 });
    }

    const user = await prisma.user.findFirst({
      where: {
        twilioPhoneNumber: to,
        twilioAccountSid: accountSid,
        whatsappEnabled: true,
      },
      select: {
        id: true,
        name: true,
        username: true,
        twilioAccountSid: true,
        twilioAuthToken: true,
        twilioPhoneNumber: true,
        bots: {
          where: { isActive: true },
          take: 1,
          include: { documents: true },
        },
        bookingPages: {
          where: { isActive: true },
          take: 1,
          select: { slug: true },
        },
      },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    await prisma.whatsAppMessage.create({
      data: {
        userId: user.id,
        phone: from,
        message: body,
        direction: 'INCOMING',
        status: 'DELIVERED',
        provider: 'twilio',
        twilioSid: messageSid,
      },
    });

    const bot = user.bots[0];
    if (!bot) return NextResponse.json({ success: true });

    const conversation = await prisma.botConversation.findUnique({
      where: { botId_phone: { botId: bot.id, phone: from } },
    });
    const history = conversation && Array.isArray(conversation.messages)
      ? (conversation.messages as Array<{ role: 'user' | 'assistant'; content: string }>)
      : [];

    await publishBotMessage({
      externalBotId: bot.id,
      externalUserId: user.id,
      phone: from,
      role: 'user',
      content: body,
    });

    const botResponse = await generateBotResponse({
      bot,
      ownerName: user.name,
      username: user.username || user.id,
      message: body,
      bookingPages: user.bookingPages,
      conversation: history,
      channel: 'whatsapp',
    });

    const messages = [
      ...history,
      { role: 'user' as const, content: body, timestamp: new Date().toISOString() },
      { role: 'assistant' as const, content: botResponse, timestamp: new Date().toISOString() },
    ].slice(-20);

    await prisma.botConversation.upsert({
      where: { botId_phone: { botId: bot.id, phone: from } },
      create: {
        botId: bot.id,
        phone: from,
        messages: messages as any,
        lastMessageAt: new Date(),
      },
      update: {
        messages: messages as any,
        lastMessageAt: new Date(),
      },
    });

    if (!user.twilioAccountSid || !user.twilioAuthToken || !user.twilioPhoneNumber) {
      console.error('Twilio connection is not configured');
      return NextResponse.json({ success: true });
    }

    const fromNumber = user.twilioPhoneNumber.startsWith('whatsapp:')
      ? user.twilioPhoneNumber
      : `whatsapp:${user.twilioPhoneNumber}`;
    const toNumber = from.startsWith('whatsapp:') ? from : `whatsapp:${from}`;
    const authHeader = Buffer.from(`${user.twilioAccountSid}:${user.twilioAuthToken}`).toString('base64');
    const responseFormData = new URLSearchParams();
    responseFormData.append('From', fromNumber);
    responseFormData.append('To', toNumber);
    responseFormData.append('Body', botResponse);

    const sendResponse = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${user.twilioAccountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${authHeader}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: responseFormData.toString(),
      },
    );
    const sendData = await sendResponse.json();

    if (!sendResponse.ok) {
      console.error('Twilio send error:', sendData);
      return NextResponse.json({ success: true });
    }

    await prisma.whatsAppMessage.create({
      data: {
        userId: user.id,
        phone: from,
        message: botResponse,
        direction: 'OUTGOING',
        status: 'SENT',
        provider: 'twilio',
        twilioSid: sendData.sid,
      },
    });

    await publishBotMessage({
      externalBotId: bot.id,
      externalUserId: user.id,
      phone: from,
      role: 'assistant',
      content: botResponse,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error processing Twilio webhook:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'Twilio webhook endpoint is active',
    timestamp: new Date().toISOString(),
  });
}
