-- Phase B: per-resource time off (a closed day that only blocks one room/chair).
-- resourceId = NULL keeps the legacy owner-wide semantics.
ALTER TABLE "time_offs" ADD COLUMN "resource_id" TEXT;

ALTER TABLE "time_offs"
  ADD CONSTRAINT "time_offs_resource_id_fkey"
  FOREIGN KEY ("resource_id") REFERENCES "resources"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "time_offs_resource_id_idx" ON "time_offs"("resource_id");
