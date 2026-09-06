export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getAdminUser, logAdminAction } from '@/lib/admin';
import {
  clearStorageCredentials,
  getStorageConfig,
  hasStoredStorageCredentials,
  isStorageConfigured,
  normalizeEndpoint,
  PLACEHOLDER_SECRET,
  saveStorageCredentials,
  testStorageConnection,
  type StorageCredentials,
} from '@/lib/storage-config';

/**
 * GET /api/admin/storage-credentials
 * Returns whether file storage is configured and where the credentials come
 * from (never returns the secret itself).
 */
export async function GET() {
  try {
    const admin = await getAdminUser();
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const [configured, stored] = await Promise.all([
      isStorageConfigured(),
      hasStoredStorageCredentials(),
    ]);
    const cfg = await getStorageConfig();
    return NextResponse.json({
      configured,
      stored,
      source: stored ? 'database' : 'env',
      endpoint: cfg.endpoint ? normalizeEndpoint(cfg.endpoint) : '',
      bucket: cfg.bucket || '',
      region: cfg.region || 'us-east-1',
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to read storage configuration' }, { status: 500 });
  }
}

/**
 * POST /api/admin/storage-credentials
 * Body options:
 *   { endpoint, accessKey, secretKey, bucket, region, forcePathStyle } → save
 *   { clear: true }                                                    → remove saved credentials
 *   { test: true }                                                     → test the active config
 */
export async function POST(request: NextRequest) {
  try {
    const admin = await getAdminUser();
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));

    if (body.clear === true) {
      await clearStorageCredentials();
      await logAdminAction(admin.id, 'CLEAR_STORAGE_CREDENTIALS', null, { provider: 'storage' }, request);
      return NextResponse.json({ ok: true });
    }

    if (body.test === true) {
      const cfg = await getStorageConfig();
      if (!(await isStorageConfigured())) {
        return NextResponse.json(
          { error: 'Storage is not configured — save the endpoint, keys and bucket first.' },
          { status: 400 },
        );
      }
      try {
        const result = await testStorageConnection(cfg);
        await logAdminAction(admin.id, 'TEST_STORAGE', null, { ok: true, bucket: result.bucket }, request);
        return NextResponse.json({ ok: true, bucket: result.bucket });
      } catch (error: any) {
        await logAdminAction(
          admin.id,
          'TEST_STORAGE',
          null,
          { ok: false, error: error?.message || 'Connection test failed' },
          request,
        );
        return NextResponse.json({ error: error?.message || 'Connection test failed' }, { status: 500 });
      }
    }

    // Save credentials. Empty fields keep previously stored values (or env).
    const stringField = (value: unknown) => (typeof value === 'string' ? value : '');

    const creds: Partial<StorageCredentials> = {
      endpoint: stringField(body.endpoint),
      accessKey: stringField(body.accessKey),
      secretKey: stringField(body.secretKey),
      bucket: stringField(body.bucket),
      region: stringField(body.region),
      forcePathStyle: body.forcePathStyle === false ? 'false' : stringField(body.forcePathStyle) || 'true',
    };

    // When the UI shows the masked placeholder for the secret, keep the stored value.
    if (creds.secretKey === PLACEHOLDER_SECRET) {
      delete creds.secretKey;
    }

    const hasAnyValue = Object.values(creds).some((v) => typeof v === 'string' && v !== '');
    if (!hasAnyValue) {
      return NextResponse.json({ error: 'Enter at least one value' }, { status: 400 });
    }

    await saveStorageCredentials(creds);

    await logAdminAction(
      admin.id,
      'SET_STORAGE_CREDENTIALS',
      null,
      {
        endpoint: creds.endpoint ? normalizeEndpoint(creds.endpoint) : undefined,
        bucket: creds.bucket || undefined,
        region: creds.region || undefined,
        hasAccessKey: Boolean(creds.accessKey),
        hasSecretKey: Boolean(creds.secretKey),
        forcePathStyle: creds.forcePathStyle,
      },
      request,
    );

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to save credentials' }, { status: 500 });
  }
}
