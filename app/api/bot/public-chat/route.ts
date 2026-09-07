export const dynamic = 'force-dynamic';

import { NextRequest } from 'next/server';
import { handlePublicChat } from '@/lib/bot-chat';

/**
 * Public chatbot chat endpoint (alias of /api/bot/chat).
 *
 * Volkern CRM calls POST /api/bot/public-chat with
 *   { username, message, conversationHistory }
 * and expects the bot's plain-text response.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    return await handlePublicChat(body);
  } catch (error) {
    console.error('Error in public chat:', error);
    return new Response(JSON.stringify({ error: 'Failed to process chat' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}