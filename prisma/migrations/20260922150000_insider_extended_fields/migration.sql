-- AlterTable
ALTER TABLE "FinnhubInsiderTransaction" ADD COLUMN "name" TEXT;
ALTER TABLE "FinnhubInsiderTransaction" ADD COLUMN "share" REAL;
ALTER TABLE "FinnhubInsiderTransaction" ADD COLUMN "transactionPrice" REAL;
ALTER TABLE "FinnhubInsiderTransaction" ADD COLUMN "filingId" TEXT;
ALTER TABLE "FinnhubInsiderTransaction" ADD COLUMN "isDerivative" BOOLEAN;

-- CreateTable
CREATE TABLE "InsiderAggregate" (
    "symbol" TEXT NOT NULL PRIMARY KEY,
    "netBuyShares90d" REAL,
    "netBuyValue90d" REAL,
    "netBuyPct90d" REAL,
    "buyShares90d" REAL,
    "sellShares90d" REAL,
    "buyValue90d" REAL,
    "sellValue90d" REAL,
    "largestBuyValue90d" REAL,
    "largestSellValue90d" REAL,
    "uniqueBuyers14d" INTEGER,
    "uniqueSellers14d" INTEGER,
    "computedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InsiderAggregate_symbol_fkey" FOREIGN KEY ("symbol") REFERENCES "Ticker" ("symbol") ON DELETE CASCADE ON UPDATE CASCADE
);
