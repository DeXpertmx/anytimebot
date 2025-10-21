
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma as db } from '@/lib/db';

export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || !(session.user as any)?.id) {
      console.error('Unauthorized: No session found');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const documentId = searchParams.get('id');

    console.log('Delete request for document:', documentId);

    if (!documentId) {
      return NextResponse.json({ error: 'Document ID is required' }, { status: 400 });
    }

    // Verify ownership
    const document = await db.botDocument.findFirst({
      where: {
        id: documentId,
        bot: {
          userId: (session.user as any).id,
        },
      },
    });

    console.log('Document found:', document ? 'yes' : 'no');

    if (!document) {
      return NextResponse.json({ error: 'Document not found or you do not have permission' }, { status: 404 });
    }

    // Delete document
    await db.botDocument.delete({
      where: { id: documentId },
    });

    console.log('Document deleted successfully');

    return NextResponse.json({ success: true, message: 'Document deleted successfully' });
  } catch (error) {
    console.error('Error deleting document:', error);
    return NextResponse.json({ error: 'Failed to delete document' }, { status: 500 });
  }
}
