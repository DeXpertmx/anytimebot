-- Phase B: default sede per event type (in-person events without resources).
ALTER TABLE "event_types" ADD COLUMN "location_id" TEXT;

ALTER TABLE "event_types"
  ADD CONSTRAINT "event_types_location_id_fkey"
  FOREIGN KEY ("location_id") REFERENCES "locations"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "event_types_location_id_idx" ON "event_types"("location_id");
