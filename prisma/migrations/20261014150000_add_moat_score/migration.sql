-- AlterTable
ALTER TABLE "AnalysisCache" ADD COLUMN "moatScore" REAL;

-- CreateIndex
CREATE INDEX "AnalysisCache_moatScore_idx" ON "AnalysisCache"("moatScore");
