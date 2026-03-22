-- AlterTable
ALTER TABLE "AnalysisCache" ADD COLUMN "altmanZ" REAL;
ALTER TABLE "AnalysisCache" ADD COLUMN "debtRepaymentYears" REAL;
ALTER TABLE "AnalysisCache" ADD COLUMN "fcfConversion" REAL;
ALTER TABLE "AnalysisCache" ADD COLUMN "fcfMargin" REAL;
ALTER TABLE "AnalysisCache" ADD COLUMN "humanDebtInfo" TEXT;
ALTER TABLE "AnalysisCache" ADD COLUMN "humanPeInfo" TEXT;
ALTER TABLE "AnalysisCache" ADD COLUMN "lastQualitySignalAt" DATETIME;
ALTER TABLE "AnalysisCache" ADD COLUMN "marginStability" REAL;
ALTER TABLE "AnalysisCache" ADD COLUMN "negativeNiYears" INTEGER;

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "symbol" TEXT,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "email" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ValuationHistory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "symbol" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "metric" TEXT NOT NULL,
    "value" REAL NOT NULL,
    "percentile" REAL,
    "period" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ValuationHistory_symbol_fkey" FOREIGN KEY ("symbol") REFERENCES "Ticker" ("symbol") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ValuationPercentiles" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "symbol" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "p10" REAL NOT NULL,
    "p25" REAL NOT NULL,
    "p50" REAL NOT NULL,
    "p75" REAL NOT NULL,
    "p90" REAL NOT NULL,
    "mean" REAL NOT NULL,
    "stdDev" REAL NOT NULL,
    "sampleSize" INTEGER NOT NULL,
    "lastUpdated" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ValuationPercentiles_symbol_fkey" FOREIGN KEY ("symbol") REFERENCES "Ticker" ("symbol") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_endpoint_key" ON "Subscription"("endpoint");

-- CreateIndex
CREATE INDEX "ValuationHistory_symbol_date_idx" ON "ValuationHistory"("symbol", "date");

-- CreateIndex
CREATE INDEX "ValuationHistory_date_idx" ON "ValuationHistory"("date");

-- CreateIndex
CREATE INDEX "ValuationHistory_symbol_metric_idx" ON "ValuationHistory"("symbol", "metric");

-- CreateIndex
CREATE UNIQUE INDEX "ValuationHistory_symbol_date_metric_period_key" ON "ValuationHistory"("symbol", "date", "metric", "period");

-- CreateIndex
CREATE INDEX "ValuationPercentiles_symbol_metric_idx" ON "ValuationPercentiles"("symbol", "metric");

-- CreateIndex
CREATE UNIQUE INDEX "ValuationPercentiles_symbol_metric_period_key" ON "ValuationPercentiles"("symbol", "metric", "period");
