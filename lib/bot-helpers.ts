
import { prisma } from './db';
import { publishBotMessage } from './convex-server';

/**
 * Get or create conversation for a phone number
 */
export async function getOrCreateConversation(botId: string, phone: string) {
  let conversation = await prisma.botConversation.findUnique({
    where: {
      botId_phone: {
        botId,
        phone,
      },
    },
  });

  if (!conversation) {
    conversation = await prisma.botConversation.create({
      data: {
        botId,
        phone,
        messages: [],
      },
    });
  }

  return conversation;
}

/**
 * Add message to conversation history
 */
export async function addMessageToConversation(
  botId: string,
  phone: string,
  role: 'user' | 'assistant',
  content: string
) {
  const conversation = await getOrCreateConversation(botId, phone);
  
  const messages = Array.isArray(conversation.messages) ? conversation.messages : [];
  
  messages.push({
    role,
    content,
    timestamp: new Date().toISOString(),
  });

  // Keep only last 10 messages to avoid too much context
  const recentMessages = messages.slice(-10);

  await prisma.botConversation.update({
    where: { id: conversation.id },
    data: {
      messages: recentMessages,
      lastMessageAt: new Date(),
    },
  });

  await publishBotMessage({
    externalBotId: botId,
    externalUserId: conversation.botId,
    phone,
    role,
    content,
  });

  return recentMessages;
}

/**
 * Get conversation history
 */
export async function getConversationHistory(botId: string, phone: string) {
  const conversation = await getOrCreateConversation(botId, phone);
  const messages = Array.isArray(conversation.messages) ? conversation.messages : [];
  return messages;
}

/**
 * Check if message is about booking/scheduling
 */
export function isBookingIntent(message: string): boolean {
  const bookingKeywords = [
    'reserva',
    'cita',
    'agendar',
    'programar',
    'horario',
    'disponible',
    'reunión',
    'meeting',
    'appointment',
    'schedule',
    'book',
    'available',
    'cuando',
    'when',
  ];

  const lowerMessage = message.toLowerCase();
  return bookingKeywords.some((keyword) => lowerMessage.includes(keyword));
}

/**
 * Format available time slots for WhatsApp
 */
export function formatAvailableSlots(slots: any[]): string {
  if (slots.length === 0) {
    return 'Lo siento, no hay horarios disponibles en este momento.';
  }

  let message = '📅 *Horarios disponibles:*\n\n';
  
  slots.slice(0, 5).forEach((slot, index) => {
    const date = new Date(slot.startTime);
    const formattedDate = date.toLocaleDateString('es-ES', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
    const formattedTime = date.toLocaleTimeString('es-ES', {
      hour: '2-digit',
      minute: '2-digit',
    });
    
    message += `${index + 1}. ${formattedDate} a las ${formattedTime}\n`;
  });

  message += '\n_Responde con el número de tu preferencia (ej: "1")_';
  
  return message;
}

/**
 * Get personality prompt based on tone
 */
export function getPersonalityPrompt(tone: string, customPersonality?: string): string {
  const basePrompts = {
    professional: 'Mantén un tono profesional y formal. Sé cortés, preciso y enfocado en la eficiencia.',
    friendly: 'Sé amigable y cercano. Usa un lenguaje cálido y acogedor, pero mantén la profesionalidad.',
    casual: 'Sé informal y relajado. Puedes usar emojis moderadamente y un lenguaje más coloquial.',
    formal: 'Mantén un tono muy formal y respetuoso. Usa un lenguaje elegante y preciso.',
  };

  let prompt = basePrompts[tone as keyof typeof basePrompts] || basePrompts.friendly;
  
  if (customPersonality) {
    prompt += `\n\nCaracterísticas adicionales de personalidad: ${customPersonality}`;
  }

  return prompt;
}
