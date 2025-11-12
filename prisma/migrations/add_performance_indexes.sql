-- Performance indexes for optimized queries
-- These indexes support keyset pagination and sorting

-- Index for changePct sorting (DESC with NULLS LAST)
CREATE INDEX IF NOT EXISTS "SessionPrice_changePct_desc_idx" 
ON "SessionPrice" ("changePct" DESC);

-- Index for lastPrice sorting (DESC with NULLS LAST)
CREATE INDEX IF NOT EXISTS "SessionPrice_lastPrice_desc_idx" 
ON "SessionPrice" ("lastPrice" DESC);

-- Composite index for keyset pagination (score + symbol tiebreaker)
-- This supports WHERE (changePct, symbol) < (:lastChangePct, :lastSymbol)
CREATE INDEX IF NOT EXISTS "SessionPrice_changePct_symbol_idx" 
ON "SessionPrice" ("changePct" DESC, "symbol" ASC);

CREATE INDEX IF NOT EXISTS "SessionPrice_lastPrice_symbol_idx" 
ON "SessionPrice" ("lastPrice" DESC, "symbol" ASC);

-- Index for lastTs (already exists, but ensure it's optimized)
-- CREATE INDEX IF NOT EXISTS "SessionPrice_lastTs_idx" ON "SessionPrice" ("lastTs" DESC);

