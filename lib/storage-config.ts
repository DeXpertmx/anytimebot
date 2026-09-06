// File-storage configuration (MinIO / S3-compatible endpoints).
//
// Uploaded images (booking-page logos, etc.) are stored on the configured
// object storage. The connection can be configured from the admin panel
// (SystemSetting key "storage.credentials"); when saved, the stored values
// take precedence over environment variables, so enabling file uploads does
// not require environment changes or redeploys.
//
// Environment fallbacks:
//   MINIO_ENDPOINT / S3_ENDPOINT            Full URL, e.g. https://minio.example.com
//   MINIO_ACCESS_KEY / MINIO_ACCESS_KEY_ID / AWS_ACCESS_KEY_ID
//   MINIO_SECRET_KEY / MINIO_SECRET_ACCESS_KEY / AWS_SECRET_ACCESS_KEY
//   MINIO_BUCKET / AWS_BUCKET_NAME
//   MINIO_REGION / AWS_REGION               (default "us-east-1")
//   MINIO_FORCE_PATH_STYLE                  ("true" default; MinIO requires path-style)

import { prisma } from '@/lib/db';
import { S3Client } from '@aws-sdk/client-s3';

const CREDENTIALS_KEY = 'storage.credentials';

export interface StorageCredentials {
  endpoint: string;
  accessKey: string;
  secretKey: string;
  bucket: string;
  region: string;
  forcePathStyle: string; // 'true' | 'false' (stored as string, mirrors email-config)
}

export type StoredCredentials = Partial<StorageCredentials>;

export const PLACEHOLDER_SECRET = '••••••••••••••••';

/** Reads the saved admin credentials. Returns null when nothing is stored. */
async function getCredentialsRecord(): Promise<StoredCredentials | null> {
  if (!process.env.DATABASE_URL) return null;
  try {
    const row = await prisma.systemSetting.findUnique({
      where: { key: CREDENTIALS_KEY },
      select: { value: true },
    });
    if (!row) return null;
    const value = row.value as unknown;
    if (typeof value !== 'object' || value === null) return null;
    return value as StoredCredentials;
  } catch (error) {
    console.warn('Could not read saved storage credentials:', error);
    return null;
  }
}

/** Persists the storage credentials (admin panel). Empty fields keep stored values. */
export async function saveStorageCredentials(
  creds: Partial<StorageCredentials> | { [key: string]: string },
): Promise<void> {
  const current = (await getCredentialsRecord()) ?? {};

  const keys: Array<keyof StorageCredentials> = [
    'endpoint',
    'accessKey',
    'secretKey',
    'bucket',
    'region',
    'forcePathStyle',
  ];

  const next: Partial<StorageCredentials> = {};
  keys.forEach((key) => {
    const value = creds[key as keyof StorageCredentials];
    if (typeof value === 'string' && value !== '') {
      // An unchanged secret field (only placeholder dots) keeps the stored value.
      if (key === 'secretKey' && value === PLACEHOLDER_SECRET) {
        if (current[key]) (next as Record<string, string>)[key] = current[key] as string;
      } else {
        (next as Record<string, string>)[key] = value.trim();
      }
    } else if (current[key]) {
      (next as Record<string, string>)[key] = current[key] as string;
    }
  });

  // Nothing meaningful stored → remove the record entirely (fall back to env).
  if (!next.endpoint && !next.accessKey && !next.bucket) {
    await prisma.systemSetting.deleteMany({ where: { key: CREDENTIALS_KEY } });
    return;
  }

  await prisma.systemSetting.upsert({
    where: { key: CREDENTIALS_KEY },
    create: { key: CREDENTIALS_KEY, value: next },
    update: { value: next },
  });
}

/** Removes the admin-saved credentials (fallback to env vars). */
export async function clearStorageCredentials(): Promise<void> {
  if (!process.env.DATABASE_URL) return;
  await prisma.systemSetting.deleteMany({ where: { key: CREDENTIALS_KEY } });
}

/** Whether credentials were saved from the admin panel (may override env). */
export async function hasStoredStorageCredentials(): Promise<boolean> {
  const stored = await getCredentialsRecord();
  return Boolean(stored?.endpoint || stored?.accessKey || stored?.bucket);
}

function envConfig(): StorageCredentials {
  const forcePathStyleRaw = (process.env.MINIO_FORCE_PATH_STYLE || '').toLowerCase();
  const legacyEndpoint = process.env.S3_ENDPOINT || '';
  const legacySsl = (process.env.S3_USE_SSL || 'true').toLowerCase() !== 'false';

  let endpoint = process.env.MINIO_ENDPOINT || legacyEndpoint || '';
  if (!endpoint && process.env.MINIO_HOST) {
    const useSsl =
      process.env.MINIO_USE_SSL === undefined
        ? undefined
        : process.env.MINIO_USE_SSL.toLowerCase() !== 'false';
    const secure = useSsl === undefined ? true : useSsl;
    const port = process.env.MINIO_PORT || (secure ? '443' : '9000');
    endpoint = `${secure ? 'https' : 'http'}://${process.env.MINIO_HOST}:${port}`;
  }

  return {
    endpoint,
    accessKey:
      process.env.MINIO_ACCESS_KEY ||
      process.env.MINIO_ACCESS_KEY_ID ||
      process.env.AWS_ACCESS_KEY_ID ||
      '',
    secretKey:
      process.env.MINIO_SECRET_KEY ||
      process.env.MINIO_SECRET_ACCESS_KEY ||
      process.env.AWS_SECRET_ACCESS_KEY ||
      '',
    bucket: process.env.MINIO_BUCKET || process.env.AWS_BUCKET_NAME || '',
    region: process.env.MINIO_REGION || process.env.AWS_REGION || 'us-east-1',
    forcePathStyle:
      forcePathStyleRaw === '' || forcePathStyleRaw === 'true' || forcePathStyleRaw === '1'
        ? 'true'
        : 'false',
  };
}

/**
 * Returns the active storage configuration: admin-saved values take precedence
 * over environment variables, per field.
 */
export async function getStorageConfig(): Promise<StorageCredentials> {
  const env = envConfig();
  const stored = await getCredentialsRecord();
  if (!stored) return env;

  const merged: StorageCredentials = {
    endpoint: stored.endpoint || env.endpoint,
    accessKey: stored.accessKey || env.accessKey,
    secretKey: stored.secretKey || env.secretKey,
    bucket: stored.bucket || env.bucket,
    region: stored.region || env.region || 'us-east-1',
    forcePathStyle:
      stored.forcePathStyle && (stored.forcePathStyle === 'true' || stored.forcePathStyle === 'false')
        ? stored.forcePathStyle
        : env.forcePathStyle || 'true',
  };
  return merged;
}

/** Whether a usable storage configuration exists (stored or via env). */
export async function isStorageConfigured(): Promise<boolean> {
  const cfg = await getStorageConfig();
  return Boolean(
    cfg.endpoint &&
      cfg.accessKey &&
      cfg.secretKey &&
      cfg.bucket &&
      cfg.accessKey !== PLACEHOLDER_SECRET &&
      cfg.secretKey !== PLACEHOLDER_SECRET,
  );
}

/** Normalizes an endpoint for display/signing (strips trailing slash). */
export function normalizeEndpoint(endpoint: string): string {
  return endpoint.trim().replace(/\/+$/, '');
}

/** Builds an S3Client pointed at the configured storage (MinIO/S3-compatible). */
export function createStorageClient(cfg: StorageCredentials): S3Client {
  const pathStyle = cfg.forcePathStyle !== 'false';
  return new S3Client({
    region: cfg.region || 'us-east-1',
    endpoint: cfg.endpoint ? normalizeEndpoint(cfg.endpoint) : undefined,
    forcePathStyle: pathStyle,
    credentials: {
      accessKeyId: cfg.accessKey,
      secretAccessKey: cfg.secretKey,
    },
  });
}

/** Test the whole pipeline: connect, write a probe object and delete it. */
export async function testStorageConnection(cfg: StorageCredentials): Promise<{ ok: boolean; bucket: string }> {
  const { HeadBucketCommand, PutObjectCommand, DeleteObjectCommand } = await import('@aws-sdk/client-s3');
  const client = createStorageClient(cfg);
  const bucket = cfg.bucket;

  // 1) Does the bucket exist and are the credentials valid?
  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }));
  } catch (error: any) {
    const name = error?.name || '';
    if (name === 'NotFound' || name === 'NoSuchBucket' || error?.$metadata?.httpStatusCode === 404) {
      throw new Error(`Bucket "${bucket}" does not exist or is not accessible`);
    }
    if (error?.$metadata?.httpStatusCode === 403 || name === 'Forbidden' || name === 'AccessDenied') {
      throw new Error('Invalid access/secret keys (Forbidden)');
    }
    if (name === 'TimeoutError' || error?.code === 'ENOTFOUND' || error?.code === 'ECONNREFUSED') {
      throw new Error(`Cannot reach the storage endpoint (${error.code || name})`);
    }
    throw new Error(error?.message || 'Connection failed');
  }

  // 2) Verify write + delete permissions with a throwaway probe object.
  const probeKey = `__anytimebot_probe/${Date.now()}.txt`;
  try {
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: probeKey,
        Body: Buffer.from('probe'),
        ContentType: 'text/plain',
      }),
    );
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: probeKey }));
  } catch (error: any) {
    try {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: probeKey }));
    } catch {
      // ignore cleanup failure — the original error is the important one
    }
    if (error?.$metadata?.httpStatusCode === 403 || error?.name === 'AccessDenied') {
      throw new Error('Write permission denied — check the bucket policy or keys');
    }
    throw new Error(error?.message || 'Write test failed');
  }

  return { ok: true, bucket };
}
