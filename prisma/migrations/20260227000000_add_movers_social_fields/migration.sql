-- Migration: Add Movers, Social, and related fields that were added to the schema
-- but never had a corresponding migration file generated.

-- AlterTable Ticker: add movers stats + AI fields
ALTER TABLE "Ticker" ADD COLUMN "avgVolume20d"     REAL;
ALTER TABLE "Ticker" ADD COLUMN "stdDevReturn20d"  REAL;
ALTER TABLE "Ticker" ADD COLUMN "avgReturn20d"     REAL;
ALTER TABLE "Ticker" ADD COLUMN "latestMoversZScore" REAL;
ALTER TABLE "Ticker" ADD COLUMN "latestMoversRVOL"   REAL;
ALTER TABLE "Ticker" ADD COLUMN "moversReason"     TEXT;
ALTER TABLE "Ticker" ADD COLUMN "moversCategory"   TEXT;
ALTER TABLE "Ticker" ADD COLUMN "socialCopy"       TEXT;
ALTER TABLE "Ticker" ADD COLUMN "isSbcAlert"       BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Ticker" ADD COLUMN "aiConfidence"     INTEGER;

-- AlterTable SessionPrice: add movers data fields
ALTER TABLE "SessionPrice" ADD COLUMN "zScore" REAL;
ALTER TABLE "SessionPrice" ADD COLUMN "rvol"   REAL;

-- CreateTable MoverEvent
CREATE TABLE IF NOT EXISTS "MoverEvent" (
    "id"           TEXT NOT NULL PRIMARY KEY,
    "symbol"       TEXT NOT NULL,
    "timestamp"    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "date"         DATETIME NOT NULL,
    "priceAtEvent" REAL NOT NULL,
    "zScore"       REAL NOT NULL,
    "rvol"         REAL NOT NULL,
    "changePct"    REAL NOT NULL,
    "category"     TEXT,
    "reason"       TEXT,
    "sentiment"    REAL,
    "impact1h"     REAL,
    "impactEndDay" REAL,
    "impactNextDay" REAL,
    CONSTRAINT "MoverEvent_symbol_fkey" FOREIGN KEY ("symbol") REFERENCES "Ticker" ("symbol") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable VolumeBucket
CREATE TABLE IF NOT EXISTS "VolumeBucket" (
    "id"        TEXT NOT NULL PRIMARY KEY,
    "symbol"    TEXT NOT NULL,
    "bucket"    TEXT NOT NULL,
    "avgVolume" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "VolumeBucket_symbol_fkey" FOREIGN KEY ("symbol") REFERENCES "Ticker" ("symbol") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex MoverEvent
CREATE INDEX IF NOT EXISTS "MoverEvent_date_idx"     ON "MoverEvent"("date");
CREATE INDEX IF NOT EXISTS "MoverEvent_category_idx" ON "MoverEvent"("category");
CREATE INDEX IF NOT EXISTS "MoverEvent_symbol_idx"   ON "MoverEvent"("symbol");

-- CreateIndex VolumeBucket
CREATE UNIQUE INDEX IF NOT EXISTS "VolumeBucket_symbol_bucket_key" ON "VolumeBucket"("symbol", "bucket");
CREATE INDEX IF NOT EXISTS "VolumeBucket_symbol_idx" ON "VolumeBucket"("symbol");
