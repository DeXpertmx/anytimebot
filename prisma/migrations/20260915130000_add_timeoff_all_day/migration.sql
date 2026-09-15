-- Whole-day absence vs. partial-hour block. Existing rows were all whole days.
ALTER TABLE "time_offs" ADD COLUMN "all_day" BOOLEAN NOT NULL DEFAULT true;
