-- AlterTable
ALTER TABLE "Ticker" ADD COLUMN "latestPrevClose" REAL;
ALTER TABLE "Ticker" ADD COLUMN "latestPrevCloseDate" DATETIME;

-- CreateIndex
CREATE INDEX "Ticker_latestPrevCloseDate_idx" ON "Ticker"("latestPrevCloseDate");
