-- Availability polls (Doodle-style) — additive
CREATE TYPE "PollStatus" AS ENUM ('OPEN', 'CLOSED');

CREATE TABLE "availability_polls" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "duration_minutes" INTEGER NOT NULL DEFAULT 30,
    "meeting_url" TEXT,
    "status" "PollStatus" NOT NULL DEFAULT 'OPEN',
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "availability_polls_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "availability_polls_user_id_created_at_idx" ON "availability_polls"("user_id", "created_at");
ALTER TABLE "availability_polls"
    ADD CONSTRAINT "availability_polls_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "poll_slots" (
    "id" TEXT NOT NULL,
    "poll_id" TEXT NOT NULL,
    "start_time" TIMESTAMP(3) NOT NULL,
    "end_time" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "poll_slots_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "poll_slots_poll_id_idx" ON "poll_slots"("poll_id");
ALTER TABLE "poll_slots"
    ADD CONSTRAINT "poll_slots_poll_id_fkey" FOREIGN KEY ("poll_id") REFERENCES "availability_polls"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "poll_participants" (
    "id" TEXT NOT NULL,
    "poll_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "lookup_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "poll_participants_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "poll_participants_poll_id_lookup_key_key" ON "poll_participants"("poll_id", "lookup_key");
ALTER TABLE "poll_participants"
    ADD CONSTRAINT "poll_participants_poll_id_fkey" FOREIGN KEY ("poll_id") REFERENCES "availability_polls"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "poll_slot_votes" (
    "id" TEXT NOT NULL,
    "participant_id" TEXT NOT NULL,
    "slot_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "poll_slot_votes_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "poll_slot_votes_participant_id_slot_id_key" ON "poll_slot_votes"("participant_id", "slot_id");
CREATE INDEX "poll_slot_votes_slot_id_idx" ON "poll_slot_votes"("slot_id");
ALTER TABLE "poll_slot_votes"
    ADD CONSTRAINT "poll_slot_votes_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "poll_participants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "poll_slot_votes"
    ADD CONSTRAINT "poll_slot_votes_slot_id_fkey" FOREIGN KEY ("slot_id") REFERENCES "poll_slots"("id") ON DELETE CASCADE ON UPDATE CASCADE;
