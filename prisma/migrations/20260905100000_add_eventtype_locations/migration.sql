-- Multi-sede: an event type can be offered in several branches (locations).
-- The first row (by insertion) doubles as the default sede; existing events
-- that only had EventType.locationId get one row so the public page can show
-- their sede.

CREATE TABLE "event_type_locations" (
    "event_type_id" TEXT NOT NULL,
    "location_id" TEXT NOT NULL,

    CONSTRAINT "event_type_locations_pkey" PRIMARY KEY ("event_type_id","location_id")
);

-- Backfill: every event type with a default sede is offered in that sede.
INSERT INTO "event_type_locations" ("event_type_id", "location_id")
SELECT "id", "location_id" FROM "event_types"
WHERE "location_id" IS NOT NULL
ON CONFLICT DO NOTHING;

ALTER TABLE "event_type_locations" ADD CONSTRAINT "etl_event_type_fkey"
    FOREIGN KEY ("event_type_id") REFERENCES "event_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "event_type_locations" ADD CONSTRAINT "etl_location_fkey"
    FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "event_type_locations_location_id_idx" ON "event_type_locations"("location_id");
