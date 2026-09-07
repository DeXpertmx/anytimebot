-- Multi-service bookings: list of services combined into one consecutive block
ALTER TABLE "bookings" ADD COLUMN "service_items" JSONB;