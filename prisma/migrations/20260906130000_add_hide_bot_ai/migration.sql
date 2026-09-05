-- Add per-user preference to hide the "Bot IA" item from the dashboard sidebar
ALTER TABLE "users" ADD COLUMN "hide_bot_ai" BOOLEAN NOT NULL DEFAULT false;