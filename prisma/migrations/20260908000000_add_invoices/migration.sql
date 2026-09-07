-- CreateTable Invoice (auto-issued when a paid booking is completed)
CREATE TYPE "InvoiceStatus" AS ENUM ('ISSUED', 'CANCELLED');

CREATE TABLE "invoices" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "booking_id" TEXT,
    "number" TEXT NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'ISSUED',
    "issue_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "service_date" TIMESTAMP(3) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "total_amount" INTEGER NOT NULL,
    "vat_rate" INTEGER NOT NULL DEFAULT 0,
    "vat_amount" INTEGER NOT NULL DEFAULT 0,
    "items" JSONB NOT NULL,
    "issuer_name" TEXT,
    "issuer_company" TEXT,
    "issuer_address" TEXT,
    "issuer_country" TEXT,
    "issuer_vat_id" TEXT,
    "issuer_email" TEXT,
    "guest_name" TEXT NOT NULL,
    "guest_email" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "invoices_booking_id_key" ON "invoices"("booking_id");
CREATE UNIQUE INDEX "invoices_user_id_number_key" ON "invoices"("user_id", "number");
CREATE INDEX "invoices_user_id_issue_date_idx" ON "invoices"("user_id", "issue_date");

-- Foreign keys
ALTER TABLE "invoices"
    ADD CONSTRAINT "invoices_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "invoices"
    ADD CONSTRAINT "invoices_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
