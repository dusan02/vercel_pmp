-- Add tier, inHeatmap, and assetType columns to Ticker
ALTER TABLE "Ticker" ADD COLUMN "tier" INTEGER NOT NULL DEFAULT 2;
ALTER TABLE "Ticker" ADD COLUMN "inHeatmap" BOOLEAN NOT NULL DEFAULT 1;
ALTER TABLE "Ticker" ADD COLUMN "assetType" TEXT NOT NULL DEFAULT 'STOCK';

CREATE INDEX IF NOT EXISTS "Ticker_inHeatmap_idx" ON "Ticker"("inHeatmap");
CREATE INDEX IF NOT EXISTS "Ticker_tier_idx" ON "Ticker"("tier");
