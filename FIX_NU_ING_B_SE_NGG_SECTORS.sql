-- Fix sectors for tickers NU, ING, B, SE, NGG
-- These tickers are currently in "Other" or "Unrecognized" sector but should have proper sectors

UPDATE "Ticker" 
SET 
  "sector" = 'Financial Services',
  "industry" = 'Credit Services',
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "symbol" = 'NU';

UPDATE "Ticker" 
SET 
  "sector" = 'Financial Services',
  "industry" = 'Banks',
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "symbol" = 'ING';

UPDATE "Ticker" 
SET 
  "sector" = 'Industrials',
  "industry" = 'Specialty Industrial Machinery',
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "symbol" = 'B';

UPDATE "Ticker" 
SET 
  "sector" = 'Technology',
  "industry" = 'Internet Content & Information',
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "symbol" = 'SE';

UPDATE "Ticker" 
SET 
  "sector" = 'Utilities',
  "industry" = 'Utilities - Regulated Electric',
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "symbol" = 'NGG';

-- Verify the changes
SELECT "symbol", "name", "sector", "industry" 
FROM "Ticker" 
WHERE "symbol" IN ('NU', 'ING', 'B', 'SE', 'NGG');
