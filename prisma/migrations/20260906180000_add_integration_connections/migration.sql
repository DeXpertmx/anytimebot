-- Per-user OAuth connections for external video providers (Zoom, Teams).
-- Each tenant authorizes with their own account; tokens are stored here so
-- meetings can be created on the tenant's account during booking.
CREATE TABLE "integration_connections" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "access_token" TEXT,
    "refresh_token" TEXT,
    "token_type" TEXT,
    "scope" TEXT,
    "expires_at" TIMESTAMP(3),
    "provider_account_id" TEXT,
    "account_email" TEXT,
    "account_display_name" TEXT,
    "tenant_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "integration_connections_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "integration_connections_user_id_provider_key" ON "integration_connections"("user_id", "provider");
CREATE INDEX "integration_connections_provider_idx" ON "integration_connections"("provider");

ALTER TABLE "integration_connections"
    ADD CONSTRAINT "integration_connections_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;