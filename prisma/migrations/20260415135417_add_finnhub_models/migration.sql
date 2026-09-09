-- CreateTable
CREATE TABLE "FinnhubMetrics" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "symbol" TEXT NOT NULL,
    "peRatio" REAL,
    "forwardPe" REAL,
    "pbRatio" REAL,
    "psRatio" REAL,
    "evEbitda" REAL,
    "evSales" REAL,
    "pegRatio" REAL,
    "priceCashFlow" REAL,
    "priceFreeCashFlow" REAL,
    "grossMargin" REAL,
    "operatingMargin" REAL,
    "netMargin" REAL,
    "roe" REAL,
    "roa" REAL,
    "roic" REAL,
    "rote" REAL,
    "revenueGrowth" REAL,
    "earningsGrowth" REAL,
    "bookValueGrowth" REAL,
    "debtGrowth" REAL,
    "currentRatio" REAL,
    "quickRatio" REAL,
    "debtEquityRatio" REAL,
    "interestCoverage" REAL,
    "totalDebtToCapitalization" REAL,
    "revenuePerShare" REAL,
    "netIncomePerShare" REAL,
    "bookValuePerShare" REAL,
    "cashPerShare" REAL,
    "freeCashFlowPerShare" REAL,
    "beta" REAL,
    "dividendYield" REAL,
    "payoutRatio" REAL,
    "employees" INTEGER,
    "revenuePerEmployee" REAL,
    "assetTurnover" REAL,
    "inventoryTurnover" REAL,
    "receivablesTurnover" REAL,
    "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FinnhubMetrics_symbol_fkey" FOREIGN KEY ("symbol") REFERENCES "Ticker" ("symbol") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FinnhubProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "symbol" TEXT NOT NULL,
    "name" TEXT,
    "isin" TEXT,
    "cusip" TEXT,
    "exchange" TEXT,
    "currency" TEXT,
    "country" TEXT,
    "ipoDate" TEXT,
    "marketCap" REAL,
    "shareOutstanding" REAL,
    "logo" TEXT,
    "phone" TEXT,
    "weburl" TEXT,
    "finnhubIndustry" TEXT,
    "finnhubSector" TEXT,
    "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FinnhubProfile_symbol_fkey" FOREIGN KEY ("symbol") REFERENCES "Ticker" ("symbol") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FinnhubPriceTarget" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "symbol" TEXT NOT NULL,
    "targetHigh" REAL,
    "targetLow" REAL,
    "targetMean" REAL,
    "targetMedian" REAL,
    "numberOfAnalysts" INTEGER,
    "currentPrice" REAL,
    "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FinnhubPriceTarget_symbol_fkey" FOREIGN KEY ("symbol") REFERENCES "Ticker" ("symbol") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FinnhubInsiderTransaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "symbol" TEXT NOT NULL,
    "change" REAL NOT NULL,
    "filingDate" TEXT NOT NULL,
    "transactionDate" TEXT NOT NULL,
    "transactionCode" TEXT NOT NULL,
    "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FinnhubInsiderTransaction_symbol_fkey" FOREIGN KEY ("symbol") REFERENCES "Ticker" ("symbol") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "FinnhubMetrics_symbol_key" ON "FinnhubMetrics"("symbol");

-- CreateIndex
CREATE INDEX "FinnhubMetrics_symbol_idx" ON "FinnhubMetrics"("symbol");

-- CreateIndex
CREATE INDEX "FinnhubMetrics_fetchedAt_idx" ON "FinnhubMetrics"("fetchedAt");

-- CreateIndex
CREATE UNIQUE INDEX "FinnhubProfile_symbol_key" ON "FinnhubProfile"("symbol");

-- CreateIndex
CREATE INDEX "FinnhubProfile_symbol_idx" ON "FinnhubProfile"("symbol");

-- CreateIndex
CREATE INDEX "FinnhubProfile_fetchedAt_idx" ON "FinnhubProfile"("fetchedAt");

-- CreateIndex
CREATE UNIQUE INDEX "FinnhubPriceTarget_symbol_key" ON "FinnhubPriceTarget"("symbol");

-- CreateIndex
CREATE INDEX "FinnhubPriceTarget_symbol_idx" ON "FinnhubPriceTarget"("symbol");

-- CreateIndex
CREATE INDEX "FinnhubPriceTarget_fetchedAt_idx" ON "FinnhubPriceTarget"("fetchedAt");

-- CreateIndex
CREATE INDEX "FinnhubInsiderTransaction_symbol_idx" ON "FinnhubInsiderTransaction"("symbol");

-- CreateIndex
CREATE INDEX "FinnhubInsiderTransaction_transactionDate_idx" ON "FinnhubInsiderTransaction"("transactionDate");

-- CreateIndex
CREATE INDEX "FinnhubInsiderTransaction_fetchedAt_idx" ON "FinnhubInsiderTransaction"("fetchedAt");
