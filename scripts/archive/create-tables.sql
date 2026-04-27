-- Create only missing tables (Ticker, DailyRef, SessionPrice)
-- EarningsCalendar and UserPreferences already exist

CREATE TABLE IF NOT EXISTS "Ticker" (
    "symbol" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT,
    "sector" TEXT,
    "industry" TEXT,
    "sharesOutstanding" REAL,
    "adrRatio" REAL,
    "isAdr" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS "DailyRef" (
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

CREATE TABLE IF NOT EXISTS "SessionPrice" (
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

CREATE INDEX IF NOT EXISTS "Ticker_sector_idx" ON "Ticker"("sector");
CREATE INDEX IF NOT EXISTS "Ticker_sharesOutstanding_idx" ON "Ticker"("sharesOutstanding");
CREATE INDEX IF NOT EXISTS "DailyRef_date_idx" ON "DailyRef"("date");
CREATE INDEX IF NOT EXISTS "DailyRef_symbol_idx" ON "DailyRef"("symbol");
CREATE UNIQUE INDEX IF NOT EXISTS "DailyRef_symbol_date_key" ON "DailyRef"("symbol", "date");
CREATE INDEX IF NOT EXISTS "SessionPrice_date_session_idx" ON "SessionPrice"("date", "session");
CREATE INDEX IF NOT EXISTS "SessionPrice_symbol_session_idx" ON "SessionPrice"("symbol", "session");
CREATE INDEX IF NOT EXISTS "SessionPrice_lastTs_idx" ON "SessionPrice"("lastTs");
CREATE INDEX IF NOT EXISTS "SessionPrice_changePct_idx" ON "SessionPrice"("changePct");
CREATE UNIQUE INDEX IF NOT EXISTS "SessionPrice_symbol_date_session_key" ON "SessionPrice"("symbol", "date", "session");

