-- Campaigns can now be delivered by email or WhatsApp; recipients log the
-- phone destination for WhatsApp sends.
CREATE TYPE "CampaignChannel" AS ENUM ('EMAIL', 'WHATSAPP');

ALTER TABLE "campaigns" ADD COLUMN "channel" "CampaignChannel" NOT NULL DEFAULT 'EMAIL';

ALTER TABLE "campaign_recipients" ADD COLUMN "phone" TEXT;
