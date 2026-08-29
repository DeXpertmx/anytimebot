-- Migration: Add TEAMS to VideoProvider enum
-- Run this in your Neon console or with psql

-- First, check if TEAMS already exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumlabel = 'TEAMS' 
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'VideoProvider')
  ) THEN
    ALTER TYPE "VideoProvider" ADD VALUE 'TEAMS';
    RAISE NOTICE 'Added TEAMS to VideoProvider enum';
  ELSE
    RAISE NOTICE 'TEAMS already exists in VideoProvider enum';
  END IF;
END $$;

-- Verify the enum values
SELECT enumlabel FROM pg_enum 
WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'VideoProvider')
ORDER BY enumsortorder;