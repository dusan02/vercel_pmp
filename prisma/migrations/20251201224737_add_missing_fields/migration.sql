-- AlterTable
ALTER TABLE "Ticker" ADD COLUMN "lastChangePct" REAL;
ALTER TABLE "Ticker" ADD COLUMN "lastMarketCap" REAL;
ALTER TABLE "Ticker" ADD COLUMN "lastMarketCapDiff" REAL;
ALTER TABLE "Ticker" ADD COLUMN "lastPrice" REAL;
ALTER TABLE "Ticker" ADD COLUMN "lastPriceUpdated" DATETIME;
ALTER TABLE "Ticker" ADD COLUMN "logoUrl" TEXT;

-- CreateTable
CREATE TABLE "UserFavorite" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "ticker" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserFavorite_ticker_fkey" FOREIGN KEY ("ticker") REFERENCES "Ticker" ("symbol") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "UserFavorite_userId_idx" ON "UserFavorite"("userId");

-- CreateIndex
CREATE INDEX "UserFavorite_ticker_idx" ON "UserFavorite"("ticker");

-- CreateIndex
CREATE UNIQUE INDEX "UserFavorite_userId_ticker_key" ON "UserFavorite"("userId", "ticker");

-- CreateIndex
CREATE INDEX "Ticker_lastPrice_idx" ON "Ticker"("lastPrice");

-- CreateIndex
CREATE INDEX "Ticker_lastChangePct_idx" ON "Ticker"("lastChangePct");

-- CreateIndex
CREATE INDEX "Ticker_lastMarketCap_idx" ON "Ticker"("lastMarketCap");

-- CreateIndex
CREATE INDEX "Ticker_lastMarketCapDiff_idx" ON "Ticker"("lastMarketCapDiff");
