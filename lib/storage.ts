// Storage helpers for uploaded images (booking-page logos and future uploads).
//
// Files live under `logos/<userId>/...` in the configured bucket and are served
// back through the app proxy route `/api/storage/[...key]`, so images work even
// when the MinIO/S3 endpoint is private. Only authenticated users can upload.

import { randomBytes } from 'crypto';
import { GetObjectCommand, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { createStorageClient, getStorageConfig } from './storage-config';

export { storageKeyFromUrl } from './storage-url';

export const MAX_IMAGE_BYTES = 4 * 1024 * 1024; // 4 MB

const IMAGE_MIME_TO_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
};

const IMAGE_EXT_TO_MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  svg: 'image/svg+xml',
};

/** Whether a content type is an allowed image for upload. */
export function isAllowedImageType(contentType: string): boolean {
  return Boolean(IMAGE_MIME_TO_EXT[contentType.toLowerCase()]);
}

export function extForMime(contentType: string): string {
  return IMAGE_MIME_TO_EXT[contentType.toLowerCase()] || 'png';
}

export function mimeForExt(ext: string): string {
  return IMAGE_EXT_TO_MIME[ext.toLowerCase()] || 'application/octet-stream';
}

/** Uploads an image for a user. Returns the object key. */
export async function uploadImage(opts: {
  buffer: Buffer;
  contentType: string;
  userId: string;
  folder?: string;
}): Promise<string> {
  const { buffer, contentType, userId } = opts;
  const folder = opts.folder || 'logos';
  const cfg = await getStorageConfig();
  const client = createStorageClient(cfg);

  const ext = extForMime(contentType);
  const key = `${folder}/${userId}/${Date.now()}-${randomBytes(6).toString('hex')}.${ext}`;

  await client.send(
    new PutObjectCommand({
      Bucket: cfg.bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      CacheControl: 'public, max-age=31536000, immutable',
    }),
  );
  return key;
}

/** Reads an object. Returns its bytes and content type. */
export async function readObject(key: string): Promise<{ buffer: Buffer; contentType: string }> {
  const cfg = await getStorageConfig();
  const client = createStorageClient(cfg);
  const out = await client.send(
    new GetObjectCommand({ Bucket: cfg.bucket, Key: key }),
  );
  const buffer = Buffer.from(await out.Body!.transformToByteArray());
  return {
    buffer,
    contentType: out.ContentType || 'application/octet-stream',
  };
}

/** Deletes an object from storage. Silently ignores missing objects. */
export async function deleteObject(key: string): Promise<void> {
  const cfg = await getStorageConfig();
  const client = createStorageClient(cfg);
  try {
    await client.send(new DeleteObjectCommand({ Bucket: cfg.bucket, Key: key }));
  } catch (error: any) {
    // NotFound is fine; other errors surface
    if (error?.$metadata?.httpStatusCode !== 404 && error?.name !== 'NotFound') {
      console.error('Error deleting storage object:', error);
    }
  }
}

/**
 * Deletes a previously uploaded file owned by the same user (used to replace
 * a logo without leaking old objects). Returns whether anything was deleted.
 */
export async function deleteOwnedFile(key: string, userId: string): Promise<boolean> {
  const prefix = `logos/${userId}/`;
  if (!key || !key.startsWith(prefix)) return false;
  await deleteObject(key);
  return true;
}
