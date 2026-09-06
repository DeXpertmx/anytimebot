export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import {
  MAX_IMAGE_BYTES,
  deleteOwnedFile,
  isAllowedImageType,
  uploadImage,
} from '@/lib/storage';
import { isStorageConfigured } from '@/lib/storage-config';

// POST /api/uploads/logo
// Multipart form:  { file: File, previousKey?: string }
// Uploads a logo image to the configured MinIO/S3 storage and returns its
// public app URL (`{origin}/api/storage/<key>`), which the booking-page
// branding stores as logoUrl.
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || !(session.user as any)?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = (session.user as any).id as string;

    const configured = await isStorageConfigured();
    if (!configured) {
      return NextResponse.json(
        { error: 'File uploads are not configured yet. Use a logo URL instead.', code: 'STORAGE_NOT_CONFIGURED' },
        { status: 400 },
      );
    }

    const formData = await request.formData();
    const file = formData.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const contentType = file.type || 'image/png';
    if (!isAllowedImageType(contentType)) {
      return NextResponse.json(
        { error: 'Unsupported image type. Use PNG, JPG, WebP, GIF or SVG.' },
        { status: 400 },
      );
    }
    if (file.size > MAX_IMAGE_BYTES) {
      return NextResponse.json({ error: 'The image exceeds the 4 MB limit.' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    const key = await uploadImage({ buffer, contentType, userId });

    // Replace the previous file of the same user when one was supplied.
    const previousKey = typeof formData.get('previousKey') === 'string'
      ? String(formData.get('previousKey'))
      : '';
    if (previousKey) {
      await deleteOwnedFile(previousKey, userId).catch(() => undefined);
    }

    const origin = request.headers.get('origin') || new URL(request.url).origin;
    const url = `${origin}/api/storage/${key}`;

    return NextResponse.json({ success: true, url });
  } catch (error) {
    console.error('Error uploading logo:', error);
    return NextResponse.json(
      { error: 'Could not save the image. Check the storage configuration or use a logo URL.' },
      { status: 500 },
    );
  }
}
