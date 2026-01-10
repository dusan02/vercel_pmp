-- Fix sectors for tickers: LNG, SE, B, ING, HEI, E, NU, HLN, NGG
-- Copy and paste this directly into your database client or psql

UPDATE "Ticker" SET "sector" = 'Energy', "industry" = 'Oil & Gas Midstream', "updatedAt" = CURRENT_TIMESTAMP WHERE "symbol" = 'LNG';
UPDATE "Ticker" SET "sector" = 'Technology', "industry" = 'Internet Content & Information', "updatedAt" = CURRENT_TIMESTAMP WHERE "symbol" = 'SE';
UPDATE "Ticker" SET "sector" = 'Industrials', "industry" = 'Specialty Industrial Machinery', "updatedAt" = CURRENT_TIMESTAMP WHERE "symbol" = 'B';
UPDATE "Ticker" SET "sector" = 'Financial Services', "industry" = 'Banks', "updatedAt" = CURRENT_TIMESTAMP WHERE "symbol" = 'ING';
UPDATE "Ticker" SET "sector" = 'Industrials', "industry" = 'Aerospace & Defense', "updatedAt" = CURRENT_TIMESTAMP WHERE "symbol" = 'HEI';
UPDATE "Ticker" SET "sector" = 'Energy', "industry" = 'Oil & Gas Integrated', "updatedAt" = CURRENT_TIMESTAMP WHERE "symbol" = 'E';
UPDATE "Ticker" SET "sector" = 'Financial Services', "industry" = 'Credit Services', "updatedAt" = CURRENT_TIMESTAMP WHERE "symbol" = 'NU';
UPDATE "Ticker" SET "sector" = 'Healthcare', "industry" = 'Drug Manufacturers - General', "updatedAt" = CURRENT_TIMESTAMP WHERE "symbol" = 'HLN';
UPDATE "Ticker" SET "sector" = 'Utilities', "industry" = 'Utilities - Regulated Electric', "updatedAt" = CURRENT_TIMESTAMP WHERE "symbol" = 'NGG';

-- Verify
SELECT "symbol", "name", "sector", "industry" FROM "Ticker" WHERE "symbol" IN ('LNG', 'SE', 'B', 'ING', 'HEI', 'E', 'NU', 'HLN', 'NGG') ORDER BY "symbol";
