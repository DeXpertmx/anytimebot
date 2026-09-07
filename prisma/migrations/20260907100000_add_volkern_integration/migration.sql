-- Per-user Volkern CRM integration config (Anytimebot -> Volkern sync)
CREATE TABLE "volkern_integrations" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "base_url" TEXT NOT NULL DEFAULT 'https://volkern.app',
    "username" TEXT NOT NULL,
    "webhook_secret" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "sincronizar_citas" BOOLEAN NOT NULL DEFAULT true,
    "sincronizar_mensajes" BOOLEAN NOT NULL DEFAULT true,
    "total_citas_sincronizadas" INTEGER NOT NULL DEFAULT 0,
    "total_mensajes_sincronizados" INTEGER NOT NULL DEFAULT 0,
    "ultima_sincronizacion" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "volkern_integrations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "volkern_integrations_user_id_key" ON "volkern_integrations"("user_id");

-- FK to users (cascade on delete)
ALTER TABLE "volkern_integrations"
  ADD CONSTRAINT "volkern_integrations_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;