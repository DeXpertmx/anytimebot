-- Auto-generated Zoom/Teams join link stored per booking so emails,
-- reminders and the meeting room use the real meeting URL.
ALTER TABLE "bookings" ADD COLUMN "meeting_url" TEXT;