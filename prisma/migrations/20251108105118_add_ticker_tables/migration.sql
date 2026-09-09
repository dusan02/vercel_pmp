-- CreateTable
CREATE TABLE "EarningsCalendar" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ticker" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "time" TEXT NOT NULL,
    "epsEstimate" REAL,
    "epsActual" REAL,
    "revenueEstimate" REAL,
    "revenueActual" REAL,
    "epsSurprisePercent" REAL,
    "revenueSurprisePercent" REAL,
    "marketCap" REAL,
    "percentChange" REAL,
    "marketCapDiff" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "UserPreferences" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "favorites" TEXT NOT NULL,
    "theme" TEXT NOT NULL DEFAULT 'auto',
    "defaultTab" TEXT NOT NULL DEFAULT 'all',
    "autoRefresh" BOOLEAN NOT NULL DEFAULT true,
    "refreshInterval" INTEGER NOT NULL DEFAULT 30,
    "showEarnings" BOOLEAN NOT NULL DEFAULT true,
    "showNews" BOOLEAN NOT NULL DEFAULT true,
    "tableColumns" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Ticker" (
    "symbol" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT,
    "sector" TEXT,
    "industry" TEXT,
    "sharesOutstanding" REAL,
    "adrRatio" REAL,
    "isAdr" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "DailyRef" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "symbol" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "previousClose" REAL NOT NULL,
    "todayOpen" REAL,
    "regularClose" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DailyRef_symbol_fkey" FOREIGN KEY ("symbol") REFERENCES "Ticker" ("symbol") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SessionPrice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "symbol" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "session" TEXT NOT NULL,
    "lastPrice" REAL NOT NULL,
    "lastTs" DATETIME NOT NULL,
    "changePct" REAL NOT NULL,
    "source" TEXT NOT NULL,
    "quality" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SessionPrice_symbol_fkey" FOREIGN KEY ("symbol") REFERENCES "Ticker" ("symbol") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "EarningsCalendar_date_idx" ON "EarningsCalendar"("date");

-- CreateIndex
CREATE INDEX "EarningsCalendar_ticker_idx" ON "EarningsCalendar"("ticker");

-- CreateIndex
CREATE UNIQUE INDEX "EarningsCalendar_ticker_date_key" ON "EarningsCalendar"("ticker", "date");

-- CreateIndex
CREATE UNIQUE INDEX "UserPreferences_userId_key" ON "UserPreferences"("userId");

-- CreateIndex
CREATE INDEX "Ticker_sector_idx" ON "Ticker"("sector");

-- CreateIndex
CREATE INDEX "Ticker_sharesOutstanding_idx" ON "Ticker"("sharesOutstanding");

-- CreateIndex
CREATE INDEX "DailyRef_date_idx" ON "DailyRef"("date");

-- CreateIndex
CREATE INDEX "DailyRef_symbol_idx" ON "DailyRef"("symbol");

-- CreateIndex
CREATE UNIQUE INDEX "DailyRef_symbol_date_key" ON "DailyRef"("symbol", "date");

-- CreateIndex
CREATE INDEX "SessionPrice_date_session_idx" ON "SessionPrice"("date", "session");

-- CreateIndex
CREATE INDEX "SessionPrice_symbol_session_idx" ON "SessionPrice"("symbol", "session");

-- CreateIndex
CREATE INDEX "SessionPrice_lastTs_idx" ON "SessionPrice"("lastTs");

-- CreateIndex
CREATE INDEX "SessionPrice_changePct_idx" ON "SessionPrice"("changePct");

-- CreateIndex
CREATE UNIQUE INDEX "SessionPrice_symbol_date_session_key" ON "SessionPrice"("symbol", "date", "session");
