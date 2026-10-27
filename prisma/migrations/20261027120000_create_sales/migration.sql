-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "sales" (
    "id" UUID NOT NULL,
    "platform" VARCHAR(64) NOT NULL,
    "sale_id" VARCHAR(128) NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sales_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sales_occurred_at_idx" ON "sales"("occurred_at");

-- CreateIndex
CREATE INDEX "sales_platform_occurred_at_idx" ON "sales"("platform", "occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "sales_platform_sale_id_key" ON "sales"("platform", "sale_id");

ALTER TABLE "sales" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

ALTER TABLE "sales"
  ADD CONSTRAINT "sales_amount_cents_nonnegative"
  CHECK ("amount_cents" >= 0);
