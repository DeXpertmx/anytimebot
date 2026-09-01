-- Add public branding fields to booking pages (customizable logo and accent color)
ALTER TABLE "booking_pages" ADD COLUMN "brand_color" TEXT NOT NULL DEFAULT '#6366f1';
ALTER TABLE "booking_pages" ADD COLUMN "logo_url" TEXT;
