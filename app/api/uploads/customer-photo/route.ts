export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { uploadImageFile } from '@/lib/file-uploads';

// POST /api/uploads/customer-photo
// Multipart form:  { file: File, customerId: string, previousKey?: string }
// Uploads a customer photo for one of the owner's CRM contacts. The file is
// stored under customers/<userId>/<customerId>/ and the returned URL is saved
// by PATCH /api/customers/[id]. previousKey deletes the replaced photo.
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || !(session.user as any)?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = (session.user as any).id as string;

    // Resolve the customer id from the form (multipart) and verify ownership
    // so a user can never write outside their own customers namespace.
    const formData = await request.formData().catch(() => null);
    if (!formData) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }
    const customerId = typeof formData.get('customerId') === 'string' ? String(formData.get('customerId')) : '';
    if (!customerId) {
      return NextResponse.json({ error: 'customerId is required' }, { status: 400 });
    }
    const customer = await prisma.customer.findFirst({
      where: { id: customerId, userId },
      select: { id: true },
    });
    if (!customer) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    }

    const result = await uploadImageFile({
      request,
      formData,
      userId,
      folder: 'customers',
      sub: customerId,
      canDeletePrevious: (key) => key.startsWith(`customers/${userId}/${customerId}/`),
    });

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, ...(result.code ? { code: result.code } : {}) },
        { status: result.status },
      );
    }
    return NextResponse.json({ success: true, url: result.url });
  } catch (error) {
    console.error('Error uploading customer photo:', error);
    return NextResponse.json(
      { error: 'Could not save the image. Check the storage configuration.' },
      { status: 500 },
    );
  }
}
