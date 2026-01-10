-- Fix sectors for tickers that are currently in "Other" or "Unrecognized" sector
-- Tickeri: LNG, SE, B, ING, HEI, E, NU, HLN, NGG

-- LNG - Cheniere Energy - Energy / Oil & Gas Midstream
UPDATE "Ticker" 
SET 
  "sector" = 'Energy',
  "industry" = 'Oil & Gas Midstream',
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "symbol" = 'LNG';

-- SE - Sea Limited - Technology / Internet Content & Information
UPDATE "Ticker" 
SET 
  "sector" = 'Technology',
  "industry" = 'Internet Content & Information',
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "symbol" = 'SE';

-- B - Barnes Group - Industrials / Specialty Industrial Machinery
UPDATE "Ticker" 
SET 
  "sector" = 'Industrials',
  "industry" = 'Specialty Industrial Machinery',
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "symbol" = 'B';

-- ING - ING Group - Financial Services / Banks
UPDATE "Ticker" 
SET 
  "sector" = 'Financial Services',
  "industry" = 'Banks',
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "symbol" = 'ING';

-- HEI - HEICO Corporation - Industrials / Aerospace & Defense
UPDATE "Ticker" 
SET 
  "sector" = 'Industrials',
  "industry" = 'Aerospace & Defense',
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "symbol" = 'HEI';

-- E - Eni SpA - Energy / Oil & Gas Integrated
UPDATE "Ticker" 
SET 
  "sector" = 'Energy',
  "industry" = 'Oil & Gas Integrated',
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "symbol" = 'E';

-- NU - Nu Holdings - Financial Services / Credit Services
UPDATE "Ticker" 
SET 
  "sector" = 'Financial Services',
  "industry" = 'Credit Services',
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "symbol" = 'NU';

-- HLN - Haleon - Healthcare / Drug Manufacturers - General
UPDATE "Ticker" 
SET 
  "sector" = 'Healthcare',
  "industry" = 'Drug Manufacturers - General',
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "symbol" = 'HLN';

-- NGG - National Grid - Utilities / Utilities - Regulated Electric
UPDATE "Ticker" 
SET 
  "sector" = 'Utilities',
  "industry" = 'Utilities - Regulated Electric',
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "symbol" = 'NGG';

-- Verify the changes
SELECT "symbol", "name", "sector", "industry" 
FROM "Ticker" 
WHERE "symbol" IN ('LNG', 'SE', 'B', 'ING', 'HEI', 'E', 'NU', 'HLN', 'NGG')
ORDER BY "symbol";
