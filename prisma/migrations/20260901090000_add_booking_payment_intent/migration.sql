-- Store the Stripe PaymentIntent ID on paid bookings so refunds can be
-- issued from the dashboard without re-resolving the checkout session.
ALTER TABLE "bookings" ADD COLUMN "stripe_payment_intent" TEXT;