-- Add Finviz-style fundamental & technical metrics to AnalysisCache
ALTER TABLE "AnalysisCache" ADD COLUMN "roic" REAL;
ALTER TABLE "AnalysisCache" ADD COLUMN "epsCagr5y" REAL;
ALTER TABLE "AnalysisCache" ADD COLUMN "priceToCash" REAL;
ALTER TABLE "AnalysisCache" ADD COLUMN "rsi14" REAL;
ALTER TABLE "AnalysisCache" ADD COLUMN "sma20Pct" REAL;
ALTER TABLE "AnalysisCache" ADD COLUMN "sma50Pct" REAL;
ALTER TABLE "AnalysisCache" ADD COLUMN "sma200Pct" REAL;
ALTER TABLE "AnalysisCache" ADD COLUMN "perf1m" REAL;
ALTER TABLE "AnalysisCache" ADD COLUMN "perf3m" REAL;
ALTER TABLE "AnalysisCache" ADD COLUMN "perf6m" REAL;
ALTER TABLE "AnalysisCache" ADD COLUMN "perfYtd" REAL;
ALTER TABLE "AnalysisCache" ADD COLUMN "perf1y" REAL;
