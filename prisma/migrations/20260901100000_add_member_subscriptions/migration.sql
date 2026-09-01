-- Recurring billing (tenant memberships): event types can charge monthly/yearly,
-- and each client subscription is tracked so renewals count in revenue.

ALTER TABLE "event_types" ADD COLUMN "payment_interval" TEXT NOT NULL DEFAULT 'ONE_TIME';

CREATE TABLE "member_subscriptions" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "event_type_id" TEXT NOT NULL,
  "customer_name" TEXT NOT NULL,
  "customer_email" TEXT NOT NULL,
  "stripe_subscription_id" TEXT NOT NULL,
  "stripe_account_id" TEXT,
  "price" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'eur',
  "interval" TEXT NOT NULL DEFAULT 'month',
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "current_period_start" TIMESTAMP(3),
  "current_period_end" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "member_subscriptions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "member_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "member_subscriptions_event_type_id_fkey" FOREIGN KEY ("event_type_id") REFERENCES "event_types"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "member_subscriptions_stripe_subscription_id_key" ON "member_subscriptions"("stripe_subscription_id");
CREATE INDEX "member_subscriptions_user_id_idx" ON "member_subscriptions"("user_id");

CREATE TABLE "subscription_payments" (
  "id" TEXT NOT NULL,
  "subscription_id" TEXT NOT NULL,
  "stripe_invoice_id" TEXT NOT NULL,
  "amount" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'eur',
  "paid_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "subscription_payments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "subscription_payments_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "member_subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "subscription_payments_stripe_invoice_id_key" ON "subscription_payments"("stripe_invoice_id");
CREATE INDEX "subscription_payments_subscription_id_idx" ON "subscription_payments"("subscription_id");