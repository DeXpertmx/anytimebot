import { NextRequest, NextResponse } from 'next/server';
import { processWebhookRetries } from '@/lib/webhooks';

export const dynamic = 'force-dynamic';

/**
 * Cron job: retry failed outgoing webhook deliveries.
 * Runs every 5 minutes; processes up to 50 due deliveries per tick with
 * exponential backoff (1, 2, 4, 8 minutes) up to 5 attempts per delivery.
 */
export async function GET(request: NextRequest) {
  return processWebhookRetries(request);
}
