
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: {
        bots: {
          include: {
            documents: {
              orderBy: {
                createdAt: 'desc',
              },
            },
          },
          take: 1,
        },
      },
    });

    if (!user || !user.bots[0]) {
      return NextResponse.json([]);
    }

    return NextResponse.json(user.bots[0].documents);
  } catch (error) {
    console.error('Error fetching documents:', error);
    return NextResponse.json(
      { error: 'Failed to fetch documents' },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: {
        bots: {
          take: 1,
        },
      },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Create bot if it doesn't exist
    let bot = user.bots[0];
    if (!bot) {
      bot = await prisma.bot.create({
        data: {
          userId: user.id,
          name: 'MindBot',
          avatar: 'robot',
          greeting: '¡Hola! Soy tu asistente de IA. ¿En qué puedo ayudarte hoy?',
        },
      });
    }

    const contentType = req.headers.get('content-type');

    if (contentType?.includes('multipart/form-data')) {
      // Handle file upload
      const formData = await req.formData();
      const file = formData.get('file') as File;

      if (!file) {
        return NextResponse.json({ error: 'No file provided' }, { status: 400 });
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      let content = '';
      let fileType = 'txt';

      if (file.name.endsWith('.pdf')) {
        // TODO: PDF parsing support coming soon
        return NextResponse.json(
          { error: 'PDF support coming soon. Please use .txt files for now.' },
          { status: 400 }
        );
      } else {
        // Assume text file
        content = buffer.toString('utf-8');
        fileType = 'txt';
      }

      const document = await prisma.botDocument.create({
        data: {
          botId: bot.id,
          fileName: file.name,
          fileType,
          content,
        },
      });

      return NextResponse.json(document);
    } else {
      // Handle URL upload
      const { url } = await req.json();

      if (!url) {
        return NextResponse.json({ error: 'No URL provided' }, { status: 400 });
      }

      // Fetch URL content
      try {
        const response = await fetch(url);
        const content = await response.text();

        const document = await prisma.botDocument.create({
          data: {
            botId: bot.id,
            fileName: new URL(url).hostname,
            fileType: 'url',
            url,
            content,
          },
        });

        return NextResponse.json(document);
      } catch (error) {
        console.error('Error fetching URL:', error);
        return NextResponse.json(
          { error: 'Failed to fetch URL content' },
          { status: 400 }
        );
      }
    }
  } catch (error) {
    console.error('Error uploading document:', error);
    return NextResponse.json(
      { error: 'Failed to upload document' },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Document ID required' }, { status: 400 });
    }

    await prisma.botDocument.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting document:', error);
    return NextResponse.json(
      { error: 'Failed to delete document' },
      { status: 500 }
    );
  }
}
