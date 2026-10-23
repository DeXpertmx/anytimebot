-- Add the "Coach Fundador" plan tier. BASIC is retained for existing holders of
-- the legacy one-time plan (no longer sold).
ALTER TYPE "SubscriptionPlan" ADD VALUE IF NOT EXISTS 'FOUNDER';
