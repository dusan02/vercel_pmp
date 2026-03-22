-- Migration for resolving altmanZ column conflict
-- This migration handles the case where altmanZ column already exists

-- Since altmanZ already exists in AnalysisCache, we need to:
-- 1. Skip adding altmanZ again (it would cause duplicate column error)
-- 2. Add the remaining columns that don't exist yet

-- Add remaining columns from the failed migration (excluding altmanZ)
ALTER TABLE "AnalysisCache" ADD COLUMN "debtRepaymentYears" REAL;
ALTER TABLE "AnalysisCache" ADD COLUMN "fcfConversion" REAL;
ALTER TABLE "AnalysisCache" ADD COLUMN "fcfMargin" REAL;
ALTER TABLE "AnalysisCache" ADD COLUMN "humanDebtInfo" TEXT;
ALTER TABLE "AnalysisCache" ADD COLUMN "humanPeInfo" TEXT;
ALTER TABLE "AnalysisCache" ADD COLUMN "lastQualitySignalAt" DATETIME;
ALTER TABLE "AnalysisCache" ADD COLUMN "marginStability" REAL;
ALTER TABLE "AnalysisCache" ADD COLUMN "negativeNiYears" INTEGER;

-- This migration resolves the P3018 error by safely adding only the missing columns
