-- DailyValuationHistory.peForward — Finnhub consensus forward P/E snapshot.
-- Written daily from now on by fillValuationDay / syncValuationHistory;
-- history cannot be backfilled (no point-in-time estimates on our plan).
ALTER TABLE "DailyValuationHistory" ADD COLUMN "peForward" REAL;
