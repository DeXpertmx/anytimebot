-- Resellers: partners that resell Anytimebot with their own public pricing.
-- discount_percent is the wholesale discount Anytimebot grants (0-100).
CREATE TABLE "resellers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "contact_email" TEXT,
    "discount_percent" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "owner_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "resellers_pkey" PRIMARY KEY ("id")
);

-- Public prices the reseller charges per paid plan (>= wholesale price).
CREATE TABLE "reseller_plan_prices" (
    "id" TEXT NOT NULL,
    "reseller_id" TEXT NOT NULL,
    "plan" "SubscriptionPlan" NOT NULL,
    "price_cents" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reseller_plan_prices_pkey" PRIMARY KEY ("id")
);

-- Attribution: which partner brought each customer.
ALTER TABLE "users" ADD COLUMN "reseller_id" TEXT;

CREATE UNIQUE INDEX "resellers_slug_key" ON "resellers"("slug");
CREATE UNIQUE INDEX "resellers_owner_user_id_key" ON "resellers"("owner_user_id");
CREATE UNIQUE INDEX "reseller_plan_prices_reseller_id_plan_key" ON "reseller_plan_prices"("reseller_id", "plan");

ALTER TABLE "reseller_plan_prices" ADD CONSTRAINT "reseller_plan_prices_reseller_id_fkey"
    FOREIGN KEY ("reseller_id") REFERENCES "resellers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "users" ADD CONSTRAINT "users_reseller_id_fkey"
    FOREIGN KEY ("reseller_id") REFERENCES "resellers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "resellers" ADD CONSTRAINT "resellers_owner_user_id_fkey"
    FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;