-- Audit trail for Zoom/Teams meeting creation attempts (success or failure)
CREATE TABLE "video_meeting_logs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "booking_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL,
    "room_url" TEXT,
    "meeting_id" TEXT,
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "video_meeting_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "video_meeting_logs_user_id_idx" ON "video_meeting_logs"("user_id");
CREATE INDEX "video_meeting_logs_booking_id_idx" ON "video_meeting_logs"("booking_id");
CREATE INDEX "video_meeting_logs_provider_idx" ON "video_meeting_logs"("provider");
CREATE INDEX "video_meeting_logs_created_at_idx" ON "video_meeting_logs"("created_at");

ALTER TABLE "video_meeting_logs"
    ADD CONSTRAINT "video_meeting_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;