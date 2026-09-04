-- Resources & Locations (Phase A): physical sites, bookable resources and the
-- event-type ↔ resource M2M. Booking gains a resource/location snapshot; the
-- availability table becomes XOR page/resource scoped.

CREATE TYPE "ResourceType" AS ENUM ('ROOM','CHAIR','EQUIPMENT','STATION','OTHER');

-- Physical sites of the business (multi-site)
CREATE TABLE "locations" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "city" TEXT,
    "country" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "locations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "locations_user_id_is_active_idx" ON "locations"("user_id", "is_active");

ALTER TABLE "locations"
  ADD CONSTRAINT "locations_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Bookable physical units (rooms, chairs, equipment, stations)
CREATE TABLE "resources" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "location_id" TEXT,
    "name" TEXT NOT NULL,
    "type" "ResourceType" NOT NULL DEFAULT 'ROOM',
    "capacity" INTEGER NOT NULL DEFAULT 1,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "resources_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "resources_user_id_is_active_idx" ON "resources"("user_id", "is_active");
CREATE INDEX "resources_location_id_idx" ON "resources"("location_id");

ALTER TABLE "resources"
  ADD CONSTRAINT "resources_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "resources"
  ADD CONSTRAINT "resources_location_id_fkey"
  FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- M2M: event types ↔ allowed resources
CREATE TABLE "event_type_resources" (
    "event_type_id" TEXT NOT NULL,
    "resource_id" TEXT NOT NULL,

    CONSTRAINT "event_type_resources_pkey" PRIMARY KEY ("event_type_id", "resource_id")
);

ALTER TABLE "event_type_resources"
  ADD CONSTRAINT "event_type_resources_event_type_id_fkey"
  FOREIGN KEY ("event_type_id") REFERENCES "event_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "event_type_resources"
  ADD CONSTRAINT "event_type_resources_resource_id_fkey"
  FOREIGN KEY ("resource_id") REFERENCES "resources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Booking: assigned resource/location + historical snapshot
ALTER TABLE "bookings"
  ADD COLUMN "location_id" TEXT,
  ADD COLUMN "resource_id" TEXT,
  ADD COLUMN "resource_name" TEXT,
  ADD COLUMN "location_name" TEXT,
  ADD COLUMN "location_address" TEXT;

CREATE INDEX "bookings_resource_id_idx" ON "bookings"("resource_id");
CREATE INDEX "bookings_location_id_idx" ON "bookings"("location_id");

ALTER TABLE "bookings"
  ADD CONSTRAINT "bookings_location_id_fkey"
  FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "bookings"
  ADD CONSTRAINT "bookings_resource_id_fkey"
  FOREIGN KEY ("resource_id") REFERENCES "resources"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Availability: scope becomes XOR page/resource
ALTER TABLE "availability" ALTER COLUMN "booking_page_id" DROP NOT NULL;
ALTER TABLE "availability" ADD COLUMN "resource_id" TEXT;

CREATE INDEX "availability_resource_id_idx" ON "availability"("resource_id");

ALTER TABLE "availability"
  ADD CONSTRAINT "availability_resource_id_fkey"
  FOREIGN KEY ("resource_id") REFERENCES "resources"("id") ON DELETE CASCADE ON UPDATE CASCADE;
