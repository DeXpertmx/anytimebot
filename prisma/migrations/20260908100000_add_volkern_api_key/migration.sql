-- Add the Volkern tenant API key (REST auth via x-api-key) to the integration.
ALTER TABLE "volkern_integrations" ADD COLUMN "api_key" TEXT;

-- Keep it unique per user (a user connects exactly one Volkern tenant).
CREATE UNIQUE INDEX "volkern_integrations_api_key_key" ON "volkern_integrations"("api_key")
  WHERE "api_key" IS NOT NULL;
