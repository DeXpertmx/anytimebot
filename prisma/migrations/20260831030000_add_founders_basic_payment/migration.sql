-- Add the paid founders plan to the subscription enum.
ALTER TYPE "SubscriptionPlan" ADD VALUE IF NOT EXISTS 'BASIC';

-- Store the one-time checkout/payment identifiers so Stripe retries and refunds
-- can be handled without creating duplicate entitlements.
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "founders_basic_checkout_session_id" TEXT,
  ADD COLUMN IF NOT EXISTS "founders_basic_payment_intent_id" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "users_founders_basic_checkout_session_id_key"
  ON "users"("founders_basic_checkout_session_id");

CREATE UNIQUE INDEX IF NOT EXISTS "users_founders_basic_payment_intent_id_key"
  ON "users"("founders_basic_payment_intent_id");

ALTER TABLE "quotas"
  ADD COLUMN IF NOT EXISTS "max_customers" INTEGER NOT NULL DEFAULT 1000;
