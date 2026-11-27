-- Schema hygiene & index optimization (2026-11-27):
-- 1. Drop 3 verified dead legacy tables (0 rows on prod, 0 references across PMP, StockCV, GainersLosers).
-- 2. Drop redundant B-tree indexes already covered by UNIQUE constraints (~131 MiB saved on prod SQLite).
-- 3. Replace redundant FinancialStatement_symbol_idx with composite (symbol, endDate) index for hot range/sort queries.
-- 4. Ensure AnalysisCache verdict/level screener indexes exist in schema and DB.

DROP TABLE IF EXISTS "ValuationHistory";
DROP TABLE IF EXISTS "ValuationPercentiles";
DROP TABLE IF EXISTS "VolumeBucket";

DROP INDEX IF EXISTS "DailyValuationHistory_symbol_idx";
DROP INDEX IF EXISTS "DailyValuationHistory_symbol_date_peRatio_idx";
DROP INDEX IF EXISTS "DailyValuationHistory_symbol_date_pbRatio_idx";

DROP INDEX IF EXISTS "DailyRef_symbol_idx";

DROP INDEX IF EXISTS "FinancialStatement_symbol_idx";
CREATE INDEX IF NOT EXISTS "FinancialStatement_symbol_endDate_idx" ON "FinancialStatement"("symbol", "endDate");

DROP INDEX IF EXISTS "FinnhubMetrics_symbol_idx";
DROP INDEX IF EXISTS "FinnhubProfile_symbol_idx";
DROP INDEX IF EXISTS "FinnhubPriceTarget_symbol_idx";
DROP INDEX IF EXISTS "FinnhubRecommendation_symbol_idx";
DROP INDEX IF EXISTS "DailyBlogSnapshot_date_idx";

CREATE INDEX IF NOT EXISTS "AnalysisCache_verdictKey_idx" ON "AnalysisCache"("verdictKey");
CREATE INDEX IF NOT EXISTS "AnalysisCache_fundLevel_idx" ON "AnalysisCache"("fundLevel");
CREATE INDEX IF NOT EXISTS "AnalysisCache_valLevel_idx" ON "AnalysisCache"("valLevel");
