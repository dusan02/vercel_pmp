-- Current P/E vs the stock's own DailyValuationHistory P/E series:
--   pePercentile      = share of history below current (0 = cheapest day on
--                       record, 50 = at/below median, 100 = most expensive)
--   peVsMedian3yPct   = signed % vs the trailing-3Y P/E median (negative =
--                       below median; window anchored at the latest DVH row)
-- Computed in scoreCalculator (same basis as /analysis valuation panel) and
-- backfilled by scripts/backfill-pillar-scores.ts. Documentation-only file —
-- production SQLite applies this via direct ALTER TABLE per AGENTS.md.
ALTER TABLE "AnalysisCache" ADD COLUMN "pePercentile" FLOAT;
ALTER TABLE "AnalysisCache" ADD COLUMN "peVsMedian3yPct" FLOAT;
CREATE INDEX "AnalysisCache_pePercentile_idx" ON "AnalysisCache"("pePercentile");
