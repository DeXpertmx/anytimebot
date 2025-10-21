
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { sendWhatsAppMessage } from '@/lib/evolution-api';
import { findSimilarDocuments } from '@/lib/embeddings';
import {
  getConversationHistory,
  addMessageToConversation,
  isBookingIntent,
  formatAvailableSlots,
  getPersonalityPrompt,
} from '@/lib/bot-helpers';
import { getAvailableSlots, createBookingFromWhatsApp } from '@/lib/booking-helpers';

// Simple GET endpoint to verify webhook is accessible
export async function GET() {
  return NextResponse.json({ 
    status: 'active',
    message: 'WhatsApp webhook is ready to receive messages',
    timestamp: new Date().toISOString()
  });
}

// Webhook to receive incoming WhatsApp messages from Evolution API
export async function POST(req: Request) {
  try {
    const data = await req.json();
    
    console.log('='.repeat(80));
    console.log('🎯 WEBHOOK RECEIVED AT:', new Date().toISOString());
    console.log('='.repeat(80));
    console.log('WhatsApp webhook received:', JSON.stringify(data, null, 2));

    // Extract message data from Evolution API webhook
    const { key, message, pushName, instance } = data;
    
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
      console.log('User not found for instance:', instance);
      return NextResponse.json({ success: true });
    }

    console.log(`User found: ${user.email}, Bot: ${user.bots[0]?.name}`);

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

    // Check if user has bot configured
    if (!user.bots || user.bots.length === 0) {
      console.log('No bot configured for user');
      return NextResponse.json({ success: true });
    }

    const bot = user.bots[0];

    // Add user message to conversation history
    await addMessageToConversation(bot.id, clientPhone, 'user', messageText);

    // Get conversation history
    const conversationHistory = await getConversationHistory(bot.id, clientPhone);

    // Generate bot response
    console.log('Generating bot response...');
    
    let botResponse = '';

    // Check if this is a booking intent
    const hasBookingIntent = isBookingIntent(messageText);

    if (hasBookingIntent && user.bookingPages.length > 0) {
      console.log('📅 Detected booking intent');

      // Get first event type
      const eventTypes = await prisma.eventType.findMany({
        where: {
          bookingPageId: user.bookingPages[0].id,
        },
        take: 1,
      });

      if (eventTypes.length > 0) {
        const eventType = eventTypes[0];
        
        // Check if user is selecting a slot (message is a number)
        const slotNumber = parseInt(messageText.trim());
        
        if (!isNaN(slotNumber) && slotNumber >= 1 && slotNumber <= 5) {
          // User is selecting a time slot
          const recentMessages = conversationHistory.slice(-5);
          const lastBotMessage = recentMessages
            .reverse()
            .find((m: any) => m.role === 'assistant') as { role: string; content: string; timestamp: string } | undefined;

          if (lastBotMessage && lastBotMessage.content && lastBotMessage.content.includes('Horarios disponibles')) {
            // Extract slots from last message and create booking
            try {
              const slots = await getAvailableSlots(eventType.id, 7);
              
              if (slots[slotNumber - 1]) {
                const selectedSlot = slots[slotNumber - 1];
                
                // Create booking
                const booking = await createBookingFromWhatsApp(
                  eventType.id,
                  pushName || 'Cliente WhatsApp',
                  clientPhone,
                  selectedSlot.startTime
                );

                const date = new Date(selectedSlot.startTime);
                const formattedDate = date.toLocaleDateString('es-ES', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                });
                const formattedTime = date.toLocaleTimeString('es-ES', {
                  hour: '2-digit',
                  minute: '2-digit',
                });

                botResponse = `✅ *¡Reserva confirmada!*\n\n📅 Fecha: ${formattedDate}\n🕐 Hora: ${formattedTime}\n📱 Tu número: ${clientPhone}\n\nRecibirás un recordatorio antes de tu cita. ¿Hay algo más en lo que pueda ayudarte?`;
              } else {
                botResponse = 'Lo siento, ese número de horario no es válido. Por favor selecciona un número entre 1 y 5.';
              }
            } catch (error) {
              console.error('Error creating booking:', error);
              botResponse = 'Lo siento, hubo un error al crear tu reserva. Por favor intenta de nuevo.';
            }
          }
        } else {
          // Show available slots
          const slots = await getAvailableSlots(eventType.id, 7);
          botResponse = formatAvailableSlots(slots);
        }
      } else {
        botResponse = 'Lo siento, no hay tipos de eventos configurados en este momento.';
      }
    }

    // If no booking response, generate AI response
    if (!botResponse) {
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
        bookingInfo = `\n\nBooking link: https://anytimebot.app/${user.username}/${bookingPage.slug}\nWhen users ask about scheduling or availability, suggest they can book directly through WhatsApp.`;
      }

      // Build conversation context
      const conversationContext = conversationHistory
        .slice(-6)
        .map((m: any) => `${m.role === 'user' ? 'Usuario' : bot.name}: ${m.content}`)
        .join('\n');

      // Get personality prompt
      const personalityInstructions = getPersonalityPrompt(bot.tone, bot.personality || undefined);

      // Call LLM to generate response
      const systemPrompt = `You are ${bot.name}, an AI scheduling assistant for ${user.name || user.username}. 

Your role is to:
- Help visitors schedule meetings and answer questions via WhatsApp
- Provide information based on the provided context
- Guide users to book meetings when appropriate
- Keep responses concise and clear for WhatsApp (max 3-4 sentences)
- Answer in Spanish by default, unless the user writes in another language

${personalityInstructions}

${context ? `\nKnowledge base:\n${context}` : ''}
${bookingInfo}

${conversationContext ? `\nRecent conversation:\n${conversationContext}\n` : ''}

Answer the user's question naturally and conversationally. If you don't know something, say so honestly.`;

      console.log('🤖 Calling LLM API...');
      console.log('📝 System prompt length:', systemPrompt.length);
      console.log('📝 User message:', messageText);
      
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
          max_tokens: 500,
          temperature: 0.7,
        }),
      });

      console.log('🤖 LLM Response status:', llmResponse.status);

      if (!llmResponse.ok) {
        const errorText = await llmResponse.text();
        console.error('❌ LLM Error:', errorText);
        throw new Error(`Failed to get response from LLM: ${llmResponse.status}`);
      }

      const llmData = await llmResponse.json();
      botResponse = llmData.choices?.[0]?.message?.content || 'Lo siento, no pude generar una respuesta.';
    }

    console.log('✅ Bot response generated:', botResponse.substring(0, 100) + '...');

    // Add bot response to conversation history
    await addMessageToConversation(bot.id, clientPhone, 'assistant', botResponse);

    // Send response via WhatsApp
    if (user.evolutionApiUrl && user.evolutionApiKey && user.evolutionInstanceName) {
      console.log('📤 Preparing to send WhatsApp response...');
      console.log('📤 Target number:', clientPhone);
      console.log('📤 API URL:', user.evolutionApiUrl);
      console.log('📤 Instance:', user.evolutionInstanceName);
      
      const credentials = {
        apiUrl: user.evolutionApiUrl,
        apiKey: user.evolutionApiKey,
        instanceName: user.evolutionInstanceName,
      };

      const sendResult = await sendWhatsAppMessage({
        credentials,
        number: clientPhone,
        text: botResponse,
      });

      if (sendResult.success) {
        console.log('✅ Response sent successfully to WhatsApp!');
        console.log('✅ Message data:', JSON.stringify(sendResult.data, null, 2));
        
        // Store outgoing message
        await prisma.whatsAppMessage.create({
          data: {
            userId: user.id,
            phone: clientPhone,
            message: botResponse,
            direction: 'OUTGOING',
            status: 'SENT',
          },
        });
        
        console.log('✅ Message stored in database');
      } else {
        console.error('❌ Failed to send response:', sendResult.error);
      }
    } else {
      console.error('❌ Missing Evolution API credentials:', {
        hasApiUrl: !!user.evolutionApiUrl,
        hasApiKey: !!user.evolutionApiKey,
        hasInstanceName: !!user.evolutionInstanceName,
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error processing WhatsApp webhook:', error);
    return NextResponse.json({ success: true }); // Always return 200 to avoid webhook retries
  }
}
