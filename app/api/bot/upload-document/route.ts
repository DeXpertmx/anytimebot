
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma as db } from '@/lib/db';
import { generateEmbedding } from '@/lib/embeddings';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || !(session.user as any)?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const contentType = request.headers.get('content-type') || '';

    let content = '';
    let fileName = 'Document';
    let fileType = 'txt';
    let url: string | undefined;

    // Check if it's a JSON request (URL upload)
    if (contentType.includes('application/json')) {
      const body = await request.json();
      url = body.url;

      if (!url) {
        return NextResponse.json({ error: 'No URL provided' }, { status: 400 });
      }

      // Validate URL
      try {
        new URL(url);
      } catch {
        return NextResponse.json({ error: 'Invalid URL format' }, { status: 400 });
      }

      // Fetch and extract content from URL
      try {
        const response = await fetch(url, {
          headers: {
            'User-Agent': 'ANYTIMEBOT-Bot/1.0',
          },
        });

        if (!response.ok) {
          throw new Error('Failed to fetch URL');
        }

        const html = await response.text();

        // Use LLM to extract main content from HTML
        const llmResponse = await fetch('https://apps.abacus.ai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.ABACUSAI_API_KEY}`,
          },
          body: JSON.stringify({
            model: 'gpt-4.1-mini',
            messages: [
              {
                role: 'user',
                content: `Extract the main text content from this HTML, removing navigation, ads, and boilerplate. Return only the core article/content text:\n\n${html.slice(0, 50000)}`,
              },
            ],
            max_tokens: 4000,
          }),
        });

        if (!llmResponse.ok) {
          throw new Error('Failed to extract content from URL');
        }

        const llmData = await llmResponse.json();
        content = llmData.choices[0].message.content;

        // Use URL hostname as filename
        const urlObj = new URL(url);
        fileName = `${urlObj.hostname} - ${new Date().toISOString().split('T')[0]}`;
        fileType = 'url';
      } catch (error) {
        console.error('Error fetching URL:', error);
        return NextResponse.json(
          { error: 'Failed to fetch or extract content from URL' },
          { status: 500 }
        );
      }
    } else {
      // Handle file upload
      const formData = await request.formData();
      const file = formData.get('file') as File;
      const text = formData.get('text') as string;

      if (!file && !text) {
        return NextResponse.json({ error: 'No file or text provided' }, { status: 400 });
      }

      if (file) {
        fileName = file.name;
        fileType = file.name.split('.').pop()?.toLowerCase() || 'txt';

        if (fileType === 'pdf') {
          // Extract PDF content using LLM API
          const base64Buffer = await file.arrayBuffer();
          const base64String = Buffer.from(base64Buffer).toString('base64');

          const response = await fetch('https://apps.abacus.ai/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${process.env.ABACUSAI_API_KEY}`,
            },
            body: JSON.stringify({
              model: 'gpt-4.1-mini',
              messages: [
                {
                  role: 'user',
                  content: [
                    {
                      type: 'file',
                      file: {
                        filename: fileName,
                        file_data: `data:application/pdf;base64,${base64String}`,
                      },
                    },
                    {
                      type: 'text',
                      text: 'Extract all the text content from this PDF document. Return only the extracted text without any additional commentary.',
                    },
                  ],
                },
              ],
              max_tokens: 4000,
            }),
          });

          if (!response.ok) {
            const errorData = await response.json();
            console.error('PDF extraction error:', errorData);
            throw new Error('Failed to extract PDF content');
          }

          const data = await response.json();
          content = data.choices[0].message.content;
        } else if (fileType === 'txt') {
          content = await file.text();
        } else {
          return NextResponse.json(
            { error: 'Unsupported file type. Please use PDF or TXT files.' },
            { status: 400 }
          );
        }
      } else if (text) {
        content = text;
      }
    }

    // Validate content length
    if (!content || content.trim().length < 10) {
      return NextResponse.json(
        { error: 'No sufficient content extracted. Please try a different document or URL.' },
        { status: 400 }
      );
    }

    // Get or create bot
    let bot = await db.bot.findFirst({
      where: { userId: (session.user as any).id },
    });

    if (!bot) {
      bot = await db.bot.create({
        data: {
          userId: (session.user as any).id,
        },
      });
    }

    // Generate embedding for the content
    const embedding = await generateEmbedding(content);

    // Save document
    const document = await db.botDocument.create({
      data: {
        botId: bot.id,
        fileName,
        fileType,
        url,
        content,
        embedding: embedding as any,
      },
    });

    return NextResponse.json({
      success: true,
      document: {
        id: document.id,
        fileName: document.fileName,
        fileType: document.fileType,
        url: document.url,
      },
    });
  } catch (error) {
    console.error('Error uploading document:', error);
    return NextResponse.json(
      { error: 'Failed to process document' },
      { status: 500 }
    );
  }
}
