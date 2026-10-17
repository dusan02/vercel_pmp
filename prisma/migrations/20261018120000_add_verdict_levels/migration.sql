-- Normalized PMP-verdict classification persisted on AnalysisCache.
-- fundLevel: 'strong'|'mixed'|'weak' (NULL = no usable pillar scores)
-- valLevel:  'cheap'|'fair'|'expensive'|'unknown'
-- verdictKey: '<fund>_<val>' | 'none_<val>' | 'insufficient' | NULL
-- Prod SQLite is not migration-tracked — apply via better-sqlite3 ALTER TABLE.
ALTER TABLE "AnalysisCache" ADD COLUMN "fundLevel" TEXT;
ALTER TABLE "AnalysisCache" ADD COLUMN "valLevel" TEXT;
ALTER TABLE "AnalysisCache" ADD COLUMN "verdictKey" TEXT;
CREATE INDEX "AnalysisCache_verdictKey_idx" ON "AnalysisCache"("verdictKey");
CREATE INDEX "AnalysisCache_fundLevel_idx" ON "AnalysisCache"("fundLevel");
CREATE INDEX "AnalysisCache_valLevel_idx" ON "AnalysisCache"("valLevel");
