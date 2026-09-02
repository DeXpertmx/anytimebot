-- Host notes / post-meeting summary and completion timestamp for bookings.
ALTER TABLE "bookings" ADD COLUMN "notes" TEXT;
ALTER TABLE "bookings" ADD COLUMN "completed_at" TIMESTAMP(3);
