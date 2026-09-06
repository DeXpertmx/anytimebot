export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { readObject } from '@/lib/storage';
import { isStorageConfigured } from '@/lib/storage-config';

// GET /api/storage/[...key]
// Serves an object from the configured storage through the app, so uploaded
// images (booking-page logos) render even when the MinIO endpoint is private.
// The URL is not guessable (random suffix) and only holds public brand images.
export async function GET(
  _request: NextRequest,
  { params }: { params: { key: string[] } },
) {
  const rawKey = (params.key || []).join('/');
  let key: string;
  try {
    key = decodeURIComponent(rawKey);
  } catch {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (!key || key.startsWith('/') || key.includes('..')) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const configured = await isStorageConfigured();
  if (!configured) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  try {
    const { buffer, contentType } = await readObject(key);
    return new Response(new Uint8Array(buffer), {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Content-Length': String(buffer.length),
      },
    });
  } catch (error: any) {
    if (error?.$metadata?.httpStatusCode === 404 || error?.name === 'NotFound') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    console.error('Error serving storage object:', error);
    return NextResponse.json({ error: 'Storage error' }, { status: 500 });
  }
}
