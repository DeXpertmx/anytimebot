-- Add profile avatar (object storage) and CRM contact photo columns
ALTER TABLE "users" ADD COLUMN "avatar_url" TEXT;
ALTER TABLE "customers" ADD COLUMN "photo" TEXT;
