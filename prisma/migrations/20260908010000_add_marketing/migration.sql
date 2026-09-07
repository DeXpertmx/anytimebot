-- Marketing automation: coupons + email campaigns to CRM segments (additive)

-- Enums
CREATE TYPE "CouponDiscountType" AS ENUM ('PERCENTAGE', 'FIXED');
CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'SENDING', 'SENT', 'CANCELLED');
CREATE TYPE "CampaignRecipientStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- Coupons
CREATE TABLE "coupons" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT,
    "discount_type" "CouponDiscountType" NOT NULL DEFAULT 'PERCENTAGE',
    "discount_value" INTEGER NOT NULL,
    "max_redemptions" INTEGER NOT NULL DEFAULT 0,
    "redemptions" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "starts_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coupons_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "coupons_user_id_code_key" ON "coupons"("user_id", "code");
CREATE INDEX "coupons_user_id_is_active_idx" ON "coupons"("user_id", "is_active");
ALTER TABLE "coupons"
    ADD CONSTRAINT "coupons_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Campaigns
CREATE TABLE "campaigns" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "html_body" TEXT NOT NULL,
    "audience" JSONB NOT NULL,
    "coupon_code" TEXT,
    "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "sent_at" TIMESTAMP(3),
    "recipients_total" INTEGER NOT NULL DEFAULT 0,
    "sent_count" INTEGER NOT NULL DEFAULT 0,
    "failed_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "campaigns_user_id_created_at_idx" ON "campaigns"("user_id", "created_at");
ALTER TABLE "campaigns"
    ADD CONSTRAINT "campaigns_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Campaign recipients log
CREATE TABLE "campaign_recipients" (
    "id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "customer_id" TEXT,
    "status" "CampaignRecipientStatus" NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "campaign_recipients_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "campaign_recipients_campaign_id_email_key" ON "campaign_recipients"("campaign_id", "email");
CREATE INDEX "campaign_recipients_campaign_id_status_idx" ON "campaign_recipients"("campaign_id", "status");
ALTER TABLE "campaign_recipients"
    ADD CONSTRAINT "campaign_recipients_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Customer marketing opt-out (unsubscribe link flips this)
ALTER TABLE "customers" ADD COLUMN "marketing_opt_out" BOOLEAN NOT NULL DEFAULT false;

-- Booking coupon snapshot
ALTER TABLE "bookings" ADD COLUMN "coupon_code" TEXT;
ALTER TABLE "bookings" ADD COLUMN "coupon_discount" INTEGER;
