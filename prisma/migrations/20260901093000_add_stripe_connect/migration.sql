-- Each tenant can connect their own Stripe account so booking payments go
-- directly to their bank (Stripe Connect Express).
ALTER TABLE "users" ADD COLUMN "stripe_account_id" TEXT;
ALTER TABLE "users" ADD COLUMN "stripe_account_status" TEXT NOT NULL DEFAULT 'never';

CREATE UNIQUE INDEX "users_stripe_account_id_key" ON "users"("stripe_account_id");