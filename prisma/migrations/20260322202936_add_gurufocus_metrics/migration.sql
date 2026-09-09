-- AlterTable
ALTER TABLE "DailyValuationHistory" ADD COLUMN "currentRatio" REAL;
ALTER TABLE "DailyValuationHistory" ADD COLUMN "debtToEquity" REAL;
ALTER TABLE "DailyValuationHistory" ADD COLUMN "dividendYield" REAL;
ALTER TABLE "DailyValuationHistory" ADD COLUMN "evFcf" REAL;
ALTER TABLE "DailyValuationHistory" ADD COLUMN "evRevenue" REAL;
ALTER TABLE "DailyValuationHistory" ADD COLUMN "pbRatio" REAL;
ALTER TABLE "DailyValuationHistory" ADD COLUMN "pegRatio" REAL;
ALTER TABLE "DailyValuationHistory" ADD COLUMN "priceTangibleBook" REAL;
ALTER TABLE "DailyValuationHistory" ADD COLUMN "quickRatio" REAL;
ALTER TABLE "DailyValuationHistory" ADD COLUMN "roe" REAL;
ALTER TABLE "DailyValuationHistory" ADD COLUMN "roic" REAL;

-- CreateIndex
CREATE INDEX "DailyValuationHistory_symbol_date_peRatio_idx" ON "DailyValuationHistory"("symbol", "date", "peRatio");

-- CreateIndex
CREATE INDEX "DailyValuationHistory_symbol_date_pbRatio_idx" ON "DailyValuationHistory"("symbol", "date", "pbRatio");
