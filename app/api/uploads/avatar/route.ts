export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { uploadImageFile } from '@/lib/file-uploads';

// POST /api/uploads/avatar
// Multipart form:  { file: File, previousKey?: string }
// Uploads the user's profile picture. The returned URL is stored in
// User.avatar (Configuración → Perfil). previousKey deletes the replaced
// avatar object.
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || !(session.user as any)?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = (session.user as any).id as string;

    const result = await uploadImageFile({
      request,
      userId,
      folder: 'avatars',
      canDeletePrevious: (key) => key.startsWith(`avatars/${userId}/`),
    });

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, ...(result.code ? { code: result.code } : {}) },
        { status: result.status },
      );
    }
    return NextResponse.json({ success: true, url: result.url });
  } catch (error) {
    console.error('Error uploading avatar:', error);
    return NextResponse.json(
      { error: 'Could not save the image. Check the storage configuration.' },
      { status: 500 },
    );
  }
}
