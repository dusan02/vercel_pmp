
const db = require('better-sqlite3')('/var/www/premarketprice/prisma/data/premarket.db');
const stmts = ["CREATE TABLE IF NOT EXISTS \"DailyValuationHistory\" (\"id\" TEXT NOT NULL PRIMARY KEY, \"symbol\" TEXT NOT NULL, \"date\" DATETIME NOT NULL, \"closePrice\" REAL, \"marketCap\" REAL, \"peRatio\" REAL, \"psRatio\" REAL, \"evEbitda\" REAL, \"fcfYield\" REAL, \"createdAt\" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, \"updatedAt\" DATETIME NOT NULL, CONSTRAINT \"DailyValuationHistory_symbol_fkey\" FOREIGN KEY (\"symbol\") REFERENCES \"Ticker\" (\"symbol\") ON DELETE CASCADE ON UPDATE CASCADE)","CREATE TABLE IF NOT EXISTS \"AnalysisCache\" (\"id\" TEXT NOT NULL PRIMARY KEY, \"symbol\" TEXT NOT NULL, \"healthScore\" REAL, \"profitabilityScore\" REAL, \"valuationScore\" REAL, \"verdictText\" TEXT, \"piotroskiScore\" INTEGER, \"beneishScore\" REAL, \"interestCoverage\" REAL, \"revenueCagr\" REAL, \"netIncomeCagr\" REAL, \"altmanZ\" REAL, \"debtRepaymentYears\" REAL, \"fcfMargin\" REAL, \"fcfConversion\" REAL, \"humanDebtInfo\" TEXT, \"humanPeInfo\" TEXT, \"marginStability\" REAL, \"negativeNiYears\" INTEGER, \"lastQualitySignalAt\" DATETIME, \"updatedAt\" DATETIME NOT NULL, CONSTRAINT \"AnalysisCache_symbol_fkey\" FOREIGN KEY (\"symbol\") REFERENCES \"Ticker\" (\"symbol\") ON DELETE CASCADE ON UPDATE CASCADE)","CREATE UNIQUE INDEX IF NOT EXISTS \"DailyValuationHistory_symbol_date_key\" ON \"DailyValuationHistory\"(\"symbol\", \"date\")","CREATE INDEX IF NOT EXISTS \"DailyValuationHistory_symbol_idx\" ON \"DailyValuationHistory\"(\"symbol\")","CREATE INDEX IF NOT EXISTS \"DailyValuationHistory_date_idx\" ON \"DailyValuationHistory\"(\"date\")","CREATE UNIQUE INDEX IF NOT EXISTS \"AnalysisCache_symbol_key\" ON \"AnalysisCache\"(\"symbol\")","CREATE INDEX IF NOT EXISTS \"AnalysisCache_healthScore_idx\" ON \"AnalysisCache\"(\"healthScore\")","CREATE INDEX IF NOT EXISTS \"AnalysisCache_valuationScore_idx\" ON \"AnalysisCache\"(\"valuationScore\")"];
for (const stmt of stmts) {
    try {
        db.prepare(stmt).run();
        console.log('Success stmt:', stmt.substring(0, 30));
    } catch(e) {
        if (!e.message.includes('already exists')) {
            console.error('Error stmt:', e.message);
        }
    }
}
console.log('Patch complete.');
