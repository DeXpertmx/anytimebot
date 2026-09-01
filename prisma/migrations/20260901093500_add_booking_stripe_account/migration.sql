-- Track which connected account received the payment so refunds are issued
-- on the right account.
ALTER TABLE "bookings" ADD COLUMN "stripe_account_id" TEXT;