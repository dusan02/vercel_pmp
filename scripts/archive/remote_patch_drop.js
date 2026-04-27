
const db = require('better-sqlite3')('/var/www/premarketprice/prisma/data/premarket.db');

const sqls = [
  'DROP TABLE IF EXISTS "AnalysisCache";',
  'CREATE TABLE "AnalysisCache" ("id" TEXT NOT NULL PRIMARY KEY, "symbol" TEXT NOT NULL, "healthScore" REAL, "profitabilityScore" REAL, "valuationScore" REAL, "verdictText" TEXT, "piotroskiScore" INTEGER, "beneishScore" REAL, "interestCoverage" REAL, "revenueCagr" REAL, "netIncomeCagr" REAL, "altmanZ" REAL, "debtRepaymentYears" REAL, "fcfMargin" REAL, "fcfConversion" REAL, "humanDebtInfo" TEXT, "humanPeInfo" TEXT, "marginStability" REAL, "negativeNiYears" INTEGER, "lastQualitySignalAt" DATETIME, "updatedAt" DATETIME NOT NULL, CONSTRAINT "AnalysisCache_symbol_fkey" FOREIGN KEY ("symbol") REFERENCES "Ticker" ("symbol") ON DELETE CASCADE ON UPDATE CASCADE);',
  'CREATE UNIQUE INDEX "AnalysisCache_symbol_key" ON "AnalysisCache"("symbol");',
  'CREATE INDEX "AnalysisCache_healthScore_idx" ON "AnalysisCache"("healthScore");',
  'CREATE INDEX "AnalysisCache_valuationScore_idx" ON "AnalysisCache"("valuationScore");'
];

for (const stmt of sqls) {
    try {
        db.prepare(stmt).run();
        console.log('Success:', stmt.substring(0, 30));
    } catch(e) {
        if (!e.message.includes('already exists')) {
            console.error('Error:', e.message);
        }
    }
}
console.log('Patch complete.');
