-- Payment method: how the money was collected (cash / card at the desk /
-- transfer / Bizum) versus CARD_ONLINE which the Stripe webhook writes.
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'CARD_ONSITE', 'TRANSFER', 'BIZUM', 'CARD_ONLINE', 'OTHER');

ALTER TABLE "bookings" ADD COLUMN "payment_method" "PaymentMethod";
