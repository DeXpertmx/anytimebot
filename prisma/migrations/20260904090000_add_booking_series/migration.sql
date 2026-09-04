-- Recurring appointment series: rule container + back-reference on bookings
CREATE TABLE "booking_series" (
    "id" TEXT NOT NULL,
    "recurrence" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "booking_series_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "bookings" ADD COLUMN "series_id" TEXT;

CREATE INDEX "bookings_series_id_idx" ON "bookings"("series_id");

ALTER TABLE "bookings"
  ADD CONSTRAINT "bookings_series_id_fkey"
  FOREIGN KEY ("series_id") REFERENCES "booking_series"("id") ON DELETE SET NULL;
