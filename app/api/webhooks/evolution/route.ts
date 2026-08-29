
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { sendWhatsAppMessage } from '@/lib/evolution-api';
import { publishBotMessage } from '@/lib/convex-server';
import { generateBotResponse } from '@/lib/bot-response';

// Simple GET endpoint to verify webhook is accessible
export async function GET() {
  return NextResponse.json({ 
    status: 'active',
    message: 'WhatsApp webhook is ready to receive messages',
    timestamp: new Date().toISOString()
  });
}

// Webhook to receive incoming WhatsApp messages.
export async function POST(req: Request) {
  try {
    const data = await req.json();
    
    console.log('='.repeat(80));
    console.log('🎯 WHATSAPP WEBHOOK RECEIVED AT:', new Date().toISOString());
    console.log('='.repeat(80));
    console.log('WhatsApp webhook data:', JSON.stringify(data, null, 2));

    // The platform can send different event types.
    const event = data.event;
    const instance = data.instance;
    const messageData = data.data;

    console.log('📋 Event type:', event);
    console.log('📲 Instance:', instance);

    // Only process message events
    if (event !== 'messages.upsert' && event !== 'MESSAGES_UPSERT') {
      console.log('Ignoring non-message event:', event);
      return NextResponse.json({ success: true });
    }

    // Extract message data - the platform can use different structures.
    const key = messageData?.key || data.key;
    const message = messageData?.message || data.message;
    const pushName = messageData?.pushName || data.pushName;
    
    // IGNORE messages sent by the bot itself (fromMe = true)
    if (key?.fromMe === true) {
      console.log('Ignoring message from bot (fromMe = true)');
      return NextResponse.json({ success: true });
    }
    
    // Extract text from different message types
    const messageText = 
      message?.conversation || 
      message?.extendedTextMessage?.text || 
      message?.imageMessage?.caption || 
      '';
    
    if (!key?.remoteJid || !messageText || !instance) {
      console.log('Missing required fields:', { 
        hasKey: !!key, 
        hasRemoteJid: !!key?.remoteJid, 
        hasMessageText: !!messageText, 
        hasInstance: !!instance 
      });
      return NextResponse.json({ success: true });
    }

    // Extract phone number (remove WhatsApp suffix)
    const clientPhone = key.remoteJid.replace('@s.whatsapp.net', '');
    
    console.log(`📱 Message from ${clientPhone}: ${messageText}`);
    console.log(`📲 Instance: ${instance}`);
    console.log(`👤 Push name: ${pushName || 'Unknown'}`);

    // Find the user who owns this connection.
    const user = await prisma.user.findFirst({
      where: {
        evolutionInstanceName: instance,
        whatsappEnabled: true,
      },
      include: {
        bots: {
          include: {
            documents: true,
          },
          take: 1,
        },
        bookingPages: {
          where: { isActive: true },
          take: 1,
        },
      },
    });

    if (!user) {
      console.log('❌ User not found for instance:', instance);
      return NextResponse.json({ success: true });
    }

    console.log(`✅ User found: ${user.email}, Bot: ${user.bots[0]?.name}`);

    // Store incoming message (PostgreSQL is the source of truth / fallback)
    await prisma.whatsAppMessage.create({
      data: {
        userId: user.id,
        phone: clientPhone,
        message: messageText,
        direction: 'INCOMING',
        status: 'DELIVERED',
        evolutionId: key.id,
      },
    });

    // Publish incoming message to Convex for real-time conversations.
    await publishBotMessage({
      externalBotId: user.bots?.[0]?.id || user.id,
      externalUserId: user.id,
      phone: clientPhone,
      role: 'user',
      content: messageText,
      timestamp: key?.timestamp || Date.now(),
    });

    console.log('✅ Message stored in database');

    // Check if user has bot configured
    if (!user.bots || user.bots.length === 0) {
      console.log('⚠️ No bot configured for user');
      return NextResponse.json({ success: true });
    }

    const bot = user.bots[0];

    // Check if this is the first interaction with this contact
    const previousMessages = await prisma.whatsAppMessage.findMany({
      where: {
        userId: user.id,
        phone: clientPhone,
        createdAt: {
          lt: new Date(), // Messages before this one
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 5,
    });

    console.log(`📊 Previous messages: ${previousMessages.length}`);

    // Generate the response with the same configured bot behavior used by web chat.
    console.log('🤖 Generating bot response...');
    const conversation = previousMessages
      .reverse()
      .map((item) => ({
        role: item.direction === 'INCOMING' ? 'user' as const : 'assistant' as const,
        content: item.message,
      }));
    const botResponse = await generateBotResponse({
      bot,
      ownerName: user.name,
      username: user.username || user.email,
      message: messageText,
      bookingPages: user.bookingPages,
      conversation,
      channel: 'whatsapp',
    });

    // Split long responses into multiple messages (max 300 chars each)
    const messages: string[] = [];
    
    if (botResponse.length <= 300) {
      // Short response, send as single message
      messages.push(botResponse);
    } else {
      // Long response, split into multiple messages
      console.log('📨 Response is long, splitting into multiple messages...');
      
      // Split by paragraphs first
      const paragraphs = botResponse.split('\n\n').filter((p: string) => p.trim());
      
      let currentMessage = '';
      
      for (const paragraph of paragraphs) {
        // If adding this paragraph exceeds limit, save current and start new
        if (currentMessage.length + paragraph.length + 2 > 300 && currentMessage.length > 0) {
          messages.push(currentMessage.trim());
          currentMessage = paragraph;
        } else {
          currentMessage += (currentMessage ? '\n\n' : '') + paragraph;
        }
      }
      
      // Add remaining message
      if (currentMessage.trim()) {
        messages.push(currentMessage.trim());
      }
      
      console.log(`📨 Split into ${messages.length} messages`);
    }

    // Send response via WhatsApp
    if (user.evolutionApiUrl && user.evolutionApiKey && user.evolutionInstanceName) {
      console.log(`📤 Sending ${messages.length} WhatsApp message(s)...`);
      
      const credentials = {
        apiUrl: user.evolutionApiUrl,
        apiKey: user.evolutionApiKey,
        instanceName: user.evolutionInstanceName,
      };

      // Send each message with a small delay between them
      for (let i = 0; i < messages.length; i++) {
        const messageText = messages[i];
        console.log(`📤 Sending message ${i + 1}/${messages.length} (${messageText.length} chars)`);
        
        const sendResult = await sendWhatsAppMessage({
          credentials,
          number: clientPhone,
          text: messageText,
        });

        if (sendResult.success) {
          console.log(`✅ Message ${i + 1} sent successfully!`);
          
          // Store outgoing message (PostgreSQL fallback kept)
          await prisma.whatsAppMessage.create({
            data: {
              userId: user.id,
              phone: clientPhone,
              message: messageText,
              direction: 'OUTGOING',
              status: 'SENT',
            },
          });

          // Publish outbound response to Convex.
          await publishBotMessage({
            externalBotId: user.bots?.[0]?.id || user.id,
            externalUserId: user.id,
            phone: clientPhone,
            role: 'assistant',
            content: messageText,
          });
          
          // Small delay between messages to avoid rate limits
          if (i < messages.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        } else {
          console.error(`❌ Failed to send message ${i + 1}:`, sendResult.error);
        }
      }
    } else {
      console.error('❌ Missing WhatsApp connection credentials');
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('❌ Error processing WhatsApp webhook:', error);
    return NextResponse.json({ success: true }); // Always return 200 to avoid webhook retries
  }
}
