-- CreateTable
CREATE TABLE "PitEntity" (
    "id" TEXT NOT NULL,
    "cik" TEXT,
    "name" TEXT NOT NULL,

    CONSTRAINT "PitEntity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PitSecurity" (
    "id" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "figi" TEXT,
    "issueType" TEXT NOT NULL,

    CONSTRAINT "PitSecurity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PitTickerHistory" (
    "id" TEXT NOT NULL,
    "securityId" TEXT NOT NULL,
    "ticker" TEXT NOT NULL,
    "exchange" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),

    CONSTRAINT "PitTickerHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PitSecurityLifecycleFact" (
    "id" TEXT NOT NULL,
    "securityId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "availableAt" TIMESTAMP(3) NOT NULL,
    "supersededAt" TIMESTAMP(3) NOT NULL DEFAULT '9999-12-31 23:59:59'::timestamp,
    "sourceRecordHash" TEXT NOT NULL,
    "sourceProvider" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,

    CONSTRAINT "PitSecurityLifecycleFact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PitFundamentalFact" (
    "id" TEXT NOT NULL,
    "securityId" TEXT NOT NULL,
    "fiscalYear" INTEGER NOT NULL,
    "fiscalPeriod" TEXT NOT NULL,
    "periodEndDate" TIMESTAMP(3) NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "availableAt" TIMESTAMP(3) NOT NULL,
    "supersededAt" TIMESTAMP(3) NOT NULL DEFAULT '9999-12-31 23:59:59'::timestamp,
    "accessionNum" TEXT,
    "isRestatement" BOOLEAN NOT NULL DEFAULT false,
    "revenue" DOUBLE PRECISION,
    "netIncome" DOUBLE PRECISION,
    "epsDiluted" DOUBLE PRECISION,
    "sourceRecordHashes" TEXT[],
    "sourceProvider" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,

    CONSTRAINT "PitFundamentalFact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PitCorporateAction" (
    "id" TEXT NOT NULL,
    "securityId" TEXT NOT NULL,
    "economicActionId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "actionType" TEXT NOT NULL,
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "availableAt" TIMESTAMP(3) NOT NULL,
    "supersededAt" TIMESTAMP(3) NOT NULL DEFAULT '9999-12-31 23:59:59'::timestamp,
    "splitFactor" DOUBLE PRECISION,
    "dividendAmount" DOUBLE PRECISION,
    "currency" TEXT,
    "sourceRecordHash" TEXT NOT NULL,
    "sourceProvider" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,

    CONSTRAINT "PitCorporateAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PitPriceFact" (
    "id" TEXT NOT NULL,
    "securityId" TEXT NOT NULL,
    "tradeDate" TIMESTAMP(3) NOT NULL,
    "availableAt" TIMESTAMP(3) NOT NULL,
    "supersededAt" TIMESTAMP(3) NOT NULL DEFAULT '9999-12-31 23:59:59'::timestamp,
    "open" DOUBLE PRECISION NOT NULL,
    "high" DOUBLE PRECISION NOT NULL,
    "low" DOUBLE PRECISION NOT NULL,
    "close" DOUBLE PRECISION NOT NULL,
    "volume" BIGINT NOT NULL,
    "sourceRecordHash" TEXT NOT NULL,
    "sourceProvider" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,

    CONSTRAINT "PitPriceFact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PitEntity_cik_key" ON "PitEntity"("cik");

-- CreateIndex
CREATE UNIQUE INDEX "PitSecurity_figi_key" ON "PitSecurity"("figi");

-- CreateIndex
CREATE UNIQUE INDEX "PitTickerHistory_ticker_startDate_securityId_key" ON "PitTickerHistory"("ticker", "startDate", "securityId");

-- CreateIndex
CREATE INDEX "PitSecurityLifecycleFact_securityId_effectiveDate_idx" ON "PitSecurityLifecycleFact"("securityId", "effectiveDate");

-- CreateIndex
CREATE INDEX "PitSecurityLifecycleFact_securityId_availableAt_supersededA_idx" ON "PitSecurityLifecycleFact"("securityId", "availableAt", "supersededAt");

-- CreateIndex
CREATE INDEX "PitFundamentalFact_securityId_periodEndDate_idx" ON "PitFundamentalFact"("securityId", "periodEndDate");

-- CreateIndex
CREATE INDEX "PitFundamentalFact_securityId_availableAt_supersededAt_idx" ON "PitFundamentalFact"("securityId", "availableAt", "supersededAt");

-- CreateIndex
CREATE INDEX "PitCorporateAction_securityId_effectiveDate_idx" ON "PitCorporateAction"("securityId", "effectiveDate");

-- CreateIndex
CREATE INDEX "PitCorporateAction_securityId_availableAt_supersededAt_idx" ON "PitCorporateAction"("securityId", "availableAt", "supersededAt");

-- CreateIndex
CREATE INDEX "PitPriceFact_securityId_tradeDate_idx" ON "PitPriceFact"("securityId", "tradeDate");

-- CreateIndex
CREATE INDEX "PitPriceFact_securityId_availableAt_supersededAt_idx" ON "PitPriceFact"("securityId", "availableAt", "supersededAt");

-- AddForeignKey
ALTER TABLE "PitSecurity" ADD CONSTRAINT "PitSecurity_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "PitEntity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PitTickerHistory" ADD CONSTRAINT "PitTickerHistory_securityId_fkey" FOREIGN KEY ("securityId") REFERENCES "PitSecurity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PitSecurityLifecycleFact" ADD CONSTRAINT "PitSecurityLifecycleFact_securityId_fkey" FOREIGN KEY ("securityId") REFERENCES "PitSecurity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PitFundamentalFact" ADD CONSTRAINT "PitFundamentalFact_securityId_fkey" FOREIGN KEY ("securityId") REFERENCES "PitSecurity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PitCorporateAction" ADD CONSTRAINT "PitCorporateAction_securityId_fkey" FOREIGN KEY ("securityId") REFERENCES "PitSecurity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PitPriceFact" ADD CONSTRAINT "PitPriceFact_securityId_fkey" FOREIGN KEY ("securityId") REFERENCES "PitSecurity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Enable GiST
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Prevent overlapping fundamental facts for the exact same economic period
ALTER TABLE "PitFundamentalFact" 
ADD CONSTRAINT no_overlap_fundamentals
EXCLUDE USING gist (
    "securityId" WITH =, 
    "fiscalPeriod" WITH =, 
    "fiscalYear" WITH =, 
    "periodEndDate" WITH =, 
    tsrange("availableAt", "supersededAt", '[)') WITH &&
);

-- Ensure deterministic Action IDs
ALTER TABLE "PitCorporateAction"
ADD CONSTRAINT unique_action_version UNIQUE ("economicActionId", "version");
