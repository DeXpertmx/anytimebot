
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// POST: Receive WhatsApp messages from Twilio webhook
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    
    const messageSid = formData.get('MessageSid') as string;
    const from = formData.get('From') as string;
    const to = formData.get('To') as string;
    const body = formData.get('Body') as string;
    const accountSid = formData.get('AccountSid') as string;

    if (!messageSid || !from || !to || !body) {
      return NextResponse.json(
        { error: 'Missing required webhook fields' },
        { status: 400 }
      );
    }

    // Find user by Twilio phone number
    const user = await prisma.user.findFirst({
      where: {
        twilioPhoneNumber: to,
        twilioAccountSid: accountSid,
      },
      select: {
        id: true,
        bots: {
          where: { isActive: true },
          take: 1,
          select: {
            id: true,
            name: true,
            greeting: true,
            personality: true,
            tone: true,
            documents: true,
          },
        },
      },
    });

    if (!user) {
      console.error('User not found for Twilio number:', to);
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Save incoming message
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

    // Process bot response if bot is active
    if (user.bots && user.bots.length > 0) {
      const bot = user.bots[0];
      
      // Get or create conversation
      let conversation = await prisma.botConversation.findUnique({
        where: {
          botId_phone: {
            botId: bot.id,
            phone: from,
          },
        },
      });

      const messages = conversation?.messages as any[] || [];
      
      // Add user message to conversation
      messages.push({
        role: 'user',
        content: body,
        timestamp: new Date().toISOString(),
      });

      // Generate bot response using AI (placeholder - you'll need to implement AI logic)
      const botResponse = await generateBotResponse(bot, messages);

      // Add bot response to conversation
      messages.push({
        role: 'assistant',
        content: botResponse,
        timestamp: new Date().toISOString(),
      });

      // Update or create conversation
      if (conversation) {
        await prisma.botConversation.update({
          where: { id: conversation.id },
          data: {
            messages: messages as any,
            lastMessageAt: new Date(),
          },
        });
      } else {
        await prisma.botConversation.create({
          data: {
            botId: bot.id,
            phone: from,
            messages: messages as any,
            lastMessageAt: new Date(),
          },
        });
      }

      // Send bot response via Twilio
      const twilioUser = await prisma.user.findUnique({
        where: { id: user.id },
        select: {
          twilioAccountSid: true,
          twilioAuthToken: true,
        },
      });

      if (twilioUser?.twilioAccountSid && twilioUser?.twilioAuthToken) {
        const authHeader = Buffer.from(
          `${twilioUser.twilioAccountSid}:${twilioUser.twilioAuthToken}`
        ).toString('base64');

        const responseFormData = new URLSearchParams();
        responseFormData.append('From', to);
        responseFormData.append('To', from);
        responseFormData.append('Body', botResponse);

        await fetch(
          `https://api.twilio.com/2010-04-01/Accounts/${twilioUser.twilioAccountSid}/Messages.json`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Basic ${authHeader}`,
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: responseFormData.toString(),
          }
        );

        // Save outgoing bot message
        await prisma.whatsAppMessage.create({
          data: {
            userId: user.id,
            phone: from,
            message: botResponse,
            direction: 'OUTGOING',
            status: 'SENT',
            provider: 'twilio',
          },
        });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error processing Twilio webhook:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Helper function to generate bot response
async function generateBotResponse(
  bot: any,
  messages: any[]
): Promise<string> {
  // This is a placeholder - implement your AI logic here
  // You can use the bot's personality, tone, and documents to generate responses
  
  const lastUserMessage = messages[messages.length - 1].content.toLowerCase();
  
  // Simple keyword-based responses (replace with actual AI)
  if (lastUserMessage.includes('hola') || lastUserMessage.includes('hello')) {
    return bot.greeting || '¡Hola! ¿En qué puedo ayudarte?';
  }
  
  if (lastUserMessage.includes('reserva') || lastUserMessage.includes('cita')) {
    return 'Para hacer una reserva, por favor visita nuestro enlace de reservas o proporcióname tu email para enviarte el enlace.';
  }
  
  if (lastUserMessage.includes('ayuda') || lastUserMessage.includes('help')) {
    return 'Estoy aquí para ayudarte con reservas y responder tus preguntas. ¿Qué necesitas?';
  }
  
  return 'Gracias por tu mensaje. ¿Hay algo específico en lo que pueda ayudarte?';
}

// GET: Webhook verification (for Twilio setup)
export async function GET(req: NextRequest) {
  return NextResponse.json({
    message: 'Twilio webhook endpoint is active',
    timestamp: new Date().toISOString(),
  });
}
