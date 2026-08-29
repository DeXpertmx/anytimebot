import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

// GET /api/user/email-templates - Get all email templates for user
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const templates = await prisma.emailTemplate.findMany({
      where: {
        userId: (session.user as any).id,
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ success: true, data: templates });
  } catch (error) {
    console.error('Error fetching email templates:', error);
    return NextResponse.json({ error: 'Failed to fetch templates' }, { status: 500 });
  }
}

// POST /api/user/email-templates - Create or update email template
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { type, name, subject, htmlBody, isActive } = body;

    if (!type || !name || !subject || !htmlBody) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Check if template already exists for this user and type
    const existing = await prisma.emailTemplate.findFirst({
      where: {
        userId: (session.user as any).id,
        type,
      },
    });

    let template;
    if (existing) {
      // Update existing template
      template = await prisma.emailTemplate.update({
        where: { id: existing.id },
        data: {
          name,
          subject,
          htmlBody,
          isActive: isActive !== undefined ? isActive : true,
        },
      });
    } else {
      // Create new template
      template = await prisma.emailTemplate.create({
        data: {
          userId: (session.user as any).id,
          type,
          name,
          subject,
          htmlBody,
          isActive: isActive !== undefined ? isActive : true,
        },
      });
    }

    return NextResponse.json({ success: true, data: template });
  } catch (error) {
    console.error('Error saving email template:', error);
    return NextResponse.json({ error: 'Failed to save template' }, { status: 500 });
  }
}

// DELETE /api/user/email-templates - Delete email template
export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const templateId = searchParams.get('id');

    if (!templateId) {
      return NextResponse.json({ error: 'Template ID required' }, { status: 400 });
    }

    // Check if template belongs to user
    const template = await prisma.emailTemplate.findFirst({
      where: {
        id: templateId,
        userId: (session.user as any).id,
      },
    });

    if (!template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    await prisma.emailTemplate.delete({
      where: { id: templateId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting email template:', error);
    return NextResponse.json({ error: 'Failed to delete template' }, { status: 500 });
  }
}