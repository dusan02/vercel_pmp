-- AlterTable
ALTER TABLE "Ticker" ADD COLUMN "description" TEXT;
ALTER TABLE "Ticker" ADD COLUMN "employees" INTEGER;
ALTER TABLE "Ticker" ADD COLUMN "websiteUrl" TEXT;

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,
    CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" DATETIME NOT NULL,
    CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT,
    "email" TEXT,
    "emailVerified" DATETIME,
    "image" TEXT
);

-- CreateTable
CREATE TABLE "PortfolioItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "ticker" TEXT NOT NULL,
    "quantity" REAL NOT NULL,
    "avgPrice" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PortfolioItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PortfolioItem_ticker_fkey" FOREIGN KEY ("ticker") REFERENCES "Ticker" ("symbol") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "FinancialStatement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "symbol" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "endDate" DATETIME NOT NULL,
    "fiscalYear" INTEGER NOT NULL,
    "fiscalPeriod" TEXT NOT NULL,
    "revenue" REAL,
    "netIncome" REAL,
    "ebit" REAL,
    "grossProfit" REAL,
    "operatingCashFlow" REAL,
    "capex" REAL,
    "totalAssets" REAL,
    "totalLiabilities" REAL,
    "currentAssets" REAL,
    "currentLiabilities" REAL,
    "retainedEarnings" REAL,
    "totalEquity" REAL,
    "sharesOutstanding" REAL,
    "sbc" REAL,
    "interestExpense" REAL,
    "totalDebt" REAL,
    "cashAndEquivalents" REAL,
    "netPPE" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FinancialStatement_symbol_fkey" FOREIGN KEY ("symbol") REFERENCES "Ticker" ("symbol") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DailyValuationHistory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "symbol" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "closePrice" REAL,
    "marketCap" REAL,
    "peRatio" REAL,
    "psRatio" REAL,
    "evEbitda" REAL,
    "fcfYield" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DailyValuationHistory_symbol_fkey" FOREIGN KEY ("symbol") REFERENCES "Ticker" ("symbol") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AnalysisCache" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "symbol" TEXT NOT NULL,
    "healthScore" REAL,
    "profitabilityScore" REAL,
    "valuationScore" REAL,
    "verdictText" TEXT,
    "piotroskiScore" INTEGER,
    "beneishScore" REAL,
    "interestCoverage" REAL,
    "revenueCagr" REAL,
    "netIncomeCagr" REAL,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AnalysisCache_symbol_fkey" FOREIGN KEY ("symbol") REFERENCES "Ticker" ("symbol") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_UserFavorite" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "ticker" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserFavorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UserFavorite_ticker_fkey" FOREIGN KEY ("ticker") REFERENCES "Ticker" ("symbol") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_UserFavorite" ("createdAt", "id", "ticker", "userId") SELECT "createdAt", "id", "ticker", "userId" FROM "UserFavorite";
DROP TABLE "UserFavorite";
ALTER TABLE "new_UserFavorite" RENAME TO "UserFavorite";
CREATE INDEX "UserFavorite_userId_idx" ON "UserFavorite"("userId");
CREATE INDEX "UserFavorite_ticker_idx" ON "UserFavorite"("ticker");
CREATE UNIQUE INDEX "UserFavorite_userId_ticker_key" ON "UserFavorite"("userId", "ticker");
CREATE TABLE "new_UserPreferences" (
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
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "UserPreferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_UserPreferences" ("autoRefresh", "createdAt", "defaultTab", "favorites", "id", "refreshInterval", "showEarnings", "showNews", "tableColumns", "theme", "updatedAt", "userId") SELECT "autoRefresh", "createdAt", "defaultTab", "favorites", "id", "refreshInterval", "showEarnings", "showNews", "tableColumns", "theme", "updatedAt", "userId" FROM "UserPreferences";
DROP TABLE "UserPreferences";
ALTER TABLE "new_UserPreferences" RENAME TO "UserPreferences";
CREATE UNIQUE INDEX "UserPreferences_userId_key" ON "UserPreferences"("userId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "PortfolioItem_userId_idx" ON "PortfolioItem"("userId");

-- CreateIndex
CREATE INDEX "PortfolioItem_ticker_idx" ON "PortfolioItem"("ticker");

-- CreateIndex
CREATE UNIQUE INDEX "PortfolioItem_userId_ticker_key" ON "PortfolioItem"("userId", "ticker");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- CreateIndex
CREATE INDEX "FinancialStatement_symbol_idx" ON "FinancialStatement"("symbol");

-- CreateIndex
CREATE INDEX "FinancialStatement_fiscalYear_fiscalPeriod_idx" ON "FinancialStatement"("fiscalYear", "fiscalPeriod");

-- CreateIndex
CREATE INDEX "FinancialStatement_endDate_idx" ON "FinancialStatement"("endDate");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialStatement_symbol_fiscalYear_fiscalPeriod_key" ON "FinancialStatement"("symbol", "fiscalYear", "fiscalPeriod");

-- CreateIndex
CREATE INDEX "DailyValuationHistory_symbol_idx" ON "DailyValuationHistory"("symbol");

-- CreateIndex
CREATE INDEX "DailyValuationHistory_date_idx" ON "DailyValuationHistory"("date");

-- CreateIndex
CREATE UNIQUE INDEX "DailyValuationHistory_symbol_date_key" ON "DailyValuationHistory"("symbol", "date");

-- CreateIndex
CREATE UNIQUE INDEX "AnalysisCache_symbol_key" ON "AnalysisCache"("symbol");

-- CreateIndex
CREATE INDEX "AnalysisCache_healthScore_idx" ON "AnalysisCache"("healthScore");

-- CreateIndex
CREATE INDEX "AnalysisCache_valuationScore_idx" ON "AnalysisCache"("valuationScore");

-- CreateIndex
CREATE INDEX "Ticker_sector_lastMarketCap_idx" ON "Ticker"("sector", "lastMarketCap");

-- CreateIndex
CREATE INDEX "Ticker_industry_lastMarketCap_idx" ON "Ticker"("industry", "lastMarketCap");
