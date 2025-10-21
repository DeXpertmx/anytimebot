
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { sendWhatsAppMessage } from '@/lib/evolution-api';
import { findSimilarDocuments } from '@/lib/embeddings';

// Simple GET endpoint to verify webhook is accessible
export async function GET() {
  return NextResponse.json({ 
    status: 'active',
    message: 'Evolution API webhook is ready to receive messages',
    timestamp: new Date().toISOString()
  });
}

// Webhook to receive incoming WhatsApp messages from Evolution API
export async function POST(req: Request) {
  try {
    const data = await req.json();
    
    console.log('='.repeat(80));
    console.log('🎯 EVOLUTION WEBHOOK RECEIVED AT:', new Date().toISOString());
    console.log('='.repeat(80));
    console.log('Evolution webhook data:', JSON.stringify(data, null, 2));

    // Evolution API can send different event types
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

    // Extract message data - Evolution API can use different structures
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

    // Find the user who owns this Evolution instance
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

    // Store incoming message
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

    const isFirstInteraction = previousMessages.length === 0;
    console.log(`📊 Previous messages: ${previousMessages.length}, First interaction: ${isFirstInteraction}`);

    // Generate bot response
    console.log('🤖 Generating bot response...');
    
    // Find relevant documents using text search
    const documentsForSearch = bot.documents.map((doc) => ({
      id: doc.id,
      content: doc.content,
      fileName: doc.fileName,
    }));

    const similarDocs = findSimilarDocuments(messageText, documentsForSearch, 3);

    // Build context from similar documents
    let context = '';
    if (similarDocs.length > 0) {
      context = `Here is relevant information from my knowledge base:\n\n${similarDocs
        .map((doc: any, i: number) => `[Document ${i + 1}]\n${doc.content}`)
        .join('\n\n')}`;
    }

    // Build booking page info
    let bookingInfo = '';
    if (user.bookingPages.length > 0) {
      const bookingPage = user.bookingPages[0];
      const bookingUrl = `https://meetmind.abacusai.app/${user.username}/${bookingPage.slug}`;
      bookingInfo = `\n\nBooking page URL (no spaces): ${bookingUrl}`;
    }

    // Call LLM to generate response
    const greetingInstruction = isFirstInteraction
      ? 'This is your FIRST message to this contact. Greet them warmly and introduce yourself briefly.'
      : 'This is a CONTINUING conversation. DO NOT greet again. Continue the conversation naturally without saying hello, hi, or introducing yourself.';

    const systemPrompt = `You are ${bot.name}, an AI scheduling assistant for ${user.name || user.username}. 

${greetingInstruction}

Your role is to:
- Help visitors schedule meetings and answer questions via WhatsApp
- Be friendly, professional, and helpful
- Provide information based on the provided context
- Keep responses SHORT and CONCISE (1-2 short sentences maximum)
- Get straight to the point
${context ? `\n${context}` : ''}
${bookingInfo}

CRITICAL FORMATTING RULES:
- NO greetings after the first message (no "hola", "hi", "hello")
- Keep responses VERY SHORT (maximum 150 characters if possible)
- When sharing URLs, write them WITHOUT any spaces: https://meetmind.abacusai.app/username/slug
- NEVER add line breaks or spaces inside URLs
- Put URLs on their own line

Example of CORRECT URL:
https://meetmind.abacusai.app/username/slug

Example of WRONG URL (DO NOT DO THIS):
https://meetmind.abacusai.app/username /slug

Answer directly and briefly. If you don't know something, say so in one short sentence.`;

    console.log('📝 Calling LLM API...');
    
    const llmResponse = await fetch('https://apps.abacus.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.ABACUSAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4.1-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: messageText },
        ],
        max_tokens: 600,
        temperature: 0.7,
      }),
    });

    console.log('📝 LLM Response status:', llmResponse.status);

    if (!llmResponse.ok) {
      const errorText = await llmResponse.text();
      console.error('❌ LLM Error:', errorText);
      throw new Error(`Failed to get response from LLM: ${llmResponse.status}`);
    }

    const llmData = await llmResponse.json();
    let botResponse = llmData.choices?.[0]?.message?.content || 'Lo siento, no pude generar una respuesta.';

    // Clean up the response to ensure proper formatting
    botResponse = botResponse
      .trim()
      .replace(/\n{3,}/g, '\n\n') // Remove excessive line breaks
      .replace(/([a-z])([A-Z])/g, '$1 $2'); // Add space between merged words

    // Fix URLs: Remove any spaces within URLs
    botResponse = botResponse.replace(/(https?:\/\/[^\s]+)\s+([^\s]+)/g, '$1$2');
    
    console.log('✅ Bot response generated (length: ' + botResponse.length + ')');
    console.log('📝 Response preview:', botResponse.substring(0, 150) + '...');

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
          
          // Store outgoing message
          await prisma.whatsAppMessage.create({
            data: {
              userId: user.id,
              phone: clientPhone,
              message: messageText,
              direction: 'OUTGOING',
              status: 'SENT',
            },
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
      console.error('❌ Missing Evolution API credentials');
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('❌ Error processing Evolution webhook:', error);
    return NextResponse.json({ success: true }); // Always return 200 to avoid webhook retries
  }
}
