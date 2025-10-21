
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma as db } from '@/lib/db';
import { generateEmbedding, findSimilarDocuments } from '@/lib/embeddings';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { message, username } = body;

    if (!message || !username) {
      return NextResponse.json({ error: 'Message and username are required' }, { status: 400 });
    }

    // Get user and bot
    const user = await db.user.findUnique({
      where: { username },
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

    if (!user || !user.bots[0]) {
      return NextResponse.json({ error: 'Bot not found' }, { status: 404 });
    }

    const bot = user.bots[0];

    // Find relevant documents using text search
    const documentsForSearch = bot.documents.map((doc) => ({
      id: doc.id,
      content: doc.content,
      fileName: doc.fileName,
    }));

    const similarDocs = findSimilarDocuments(message, documentsForSearch, 3);

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
      const bookingUrl = `https://meetmind.abacusai.app/${username}/${bookingPage.slug}`;
      bookingInfo = `\n\nBooking page URL (no spaces): ${bookingUrl}`;
    }

    // Call LLM with streaming
    const systemPrompt = `You are ${bot.name}, an AI scheduling assistant for ${user.name || username}. 
    
Your role is to:
- Help visitors schedule meetings and answer questions
- Be friendly, professional, and helpful
- Provide information based on the provided context
- Keep responses clear and concise
- Guide users to book meetings when appropriate
${context ? `\n${context}` : ''}
${bookingInfo}

IMPORTANT FORMATTING RULES:
- Write complete sentences without cutting or merging words
- When sharing URLs, write them WITHOUT any spaces: https://meetmind.abacusai.app/username/slug
- NEVER add line breaks or spaces inside URLs
- Put URLs on their own line with a line break before and after

Example of CORRECT URL:
https://meetmind.abacusai.app/username/booking-slug

Example of WRONG URL (DO NOT DO THIS):
https://meetmind.abacusai.app/username /booking-slug

Answer the user's question naturally and conversationally. If you don't know something, say so honestly.`;

    console.log('Calling LLM API...');
    console.log('API Key exists:', !!process.env.ABACUSAI_API_KEY);
    
    const response = await fetch('https://apps.abacus.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.ABACUSAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4.1-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: message },
        ],
        stream: true,
        max_tokens: 1000,
      }),
    });

    console.log('LLM Response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('LLM Error:', errorText);
      throw new Error(`Failed to get response from LLM: ${response.status} - ${errorText}`);
    }

    // Stream the response
    const stream = new ReadableStream({
      async start(controller) {
        const reader = response.body?.getReader();
        if (!reader) {
          controller.close();
          return;
        }

        const decoder = new TextDecoder();
        const encoder = new TextEncoder();

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value);
            controller.enqueue(encoder.encode(chunk));
          }
        } catch (error) {
          console.error('Stream error:', error);
          controller.error(error);
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    console.error('Error in chat:', error);
    return NextResponse.json({ error: 'Failed to process chat' }, { status: 500 });
  }
}
