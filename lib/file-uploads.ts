// Shared server-side logic for image upload endpoints (server-only module).
//
// All upload routes (logo, avatar, customer photo) behave the same: they read
// a multipart "file", validate type/size, store the object in the per-user
// namespace and return the public app URL. The optional "previousKey" field
// lets the client ask to delete a previously uploaded object of the same kind
// so replacing an image does not leak old files.

import { NextRequest } from 'next/server';
import {
  MAX_IMAGE_BYTES,
  deleteObject,
  isAllowedImageType,
  uploadImage,
} from './storage';
import { isStorageConfigured } from './storage-config';
import { storageUrlFor } from './storage-url';

export type UploadImageFileResult =
  | { ok: true; url: string }
  | { ok: false; status: number; error: string; code?: string };

export interface UploadImageFileOptions {
  /** Used to read the multipart body and resolve the app origin. */
  request: NextRequest;
  /** Pre-parsed form; passed when the caller already consumed the body. */
  formData?: FormData;
  userId: string;
  /** Top-level namespace: logos | avatars | customers */
  folder: 'logos' | 'avatars' | 'customers';
  /** Optional extra path segment between the user id and the file (customer id). */
  sub?: string;
  /** Only previous keys for which this returns true are deleted. */
  canDeletePrevious?: (key: string) => boolean;
}

export async function uploadImageFile(opts: UploadImageFileOptions): Promise<UploadImageFileResult> {
  if (!(await isStorageConfigured())) {
    return {
      ok: false,
      status: 400,
      code: 'STORAGE_NOT_CONFIGURED',
      error: 'File uploads are not configured yet. Use an image URL instead.',
    };
  }

  const formData = opts.formData ?? (await opts.request.formData().catch(() => null));
  if (!formData) {
    return { ok: false, status: 400, error: 'Invalid request' };
  }

  const file = formData.get('file');
  if (!(file instanceof File)) {
    return { ok: false, status: 400, error: 'No file provided' };
  }

  const contentType = file.type || 'image/png';
  if (!isAllowedImageType(contentType)) {
    return {
      ok: false,
      status: 400,
      error: 'Unsupported image type. Use PNG, JPG, WebP, GIF or SVG.',
    };
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return { ok: false, status: 400, error: 'The image exceeds the 4 MB limit.' };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const key = await uploadImage({
    buffer,
    contentType,
    userId: opts.userId,
    folder: opts.folder,
    sub: opts.sub,
  });

  const rawPrevious = formData.get('previousKey');
  const previousKey = typeof rawPrevious === 'string' ? rawPrevious : '';
  if (previousKey && opts.canDeletePrevious?.(previousKey)) {
    await deleteObject(previousKey).catch(() => undefined);
  }

  const origin = opts.request.headers.get('origin') || new URL(opts.request.url).origin;
  return { ok: true, url: storageUrlFor(origin, key) };
}
