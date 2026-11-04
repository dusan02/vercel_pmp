-- Signed % of current P/E vs the stock's own trailing 1Y / 5Y / 10Y P/E median
-- (same semantics as peVsMedian3yPct; negative = below median). Powers the
-- screener "P/E vs historical median" window toggle. Documentation-only file —
-- production SQLite applies this via direct ALTER TABLE per AGENTS.md; values
-- are filled by scripts/backfill-pillar-scores.ts.
ALTER TABLE "AnalysisCache" ADD COLUMN "peVsMedian1yPct" FLOAT;
ALTER TABLE "AnalysisCache" ADD COLUMN "peVsMedian5yPct" FLOAT;
ALTER TABLE "AnalysisCache" ADD COLUMN "peVsMedian10yPct" FLOAT;
