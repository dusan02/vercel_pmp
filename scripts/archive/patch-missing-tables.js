const { Client } = require('ssh2');

const sqlCommands = `
CREATE TABLE "DailyValuationHistory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "symbol" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "closePrice" REAL,
    "marketCap" REAL,
    "peRatio" REAL,
    "psRatio" REAL,
    "evEbitda" REAL,
    "fcfYield" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DailyValuationHistory_symbol_fkey" FOREIGN KEY ("symbol") REFERENCES "Ticker" ("symbol") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "AnalysisCache" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "symbol" TEXT NOT NULL,
    "healthScore" REAL,
    "profitabilityScore" REAL,
    "valuationScore" REAL,
    "verdictText" TEXT,
    "piotroskiScore" INTEGER,
    "beneishScore" REAL,
    "interestCoverage" REAL,
    "revenueCagr" REAL,
    "netIncomeCagr" REAL,
    "altmanZ" REAL,
    "debtRepaymentYears" REAL,
    "fcfMargin" REAL,
    "fcfConversion" REAL,
    "humanDebtInfo" TEXT,
    "humanPeInfo" TEXT,
    "marginStability" REAL,
    "negativeNiYears" INTEGER,
    "lastQualitySignalAt" DATETIME,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AnalysisCache_symbol_fkey" FOREIGN KEY ("symbol") REFERENCES "Ticker" ("symbol") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "DailyValuationHistory_symbol_date_key" ON "DailyValuationHistory"("symbol", "date");
CREATE INDEX "DailyValuationHistory_symbol_idx" ON "DailyValuationHistory"("symbol");
CREATE INDEX "DailyValuationHistory_date_idx" ON "DailyValuationHistory"("date");

CREATE UNIQUE INDEX "AnalysisCache_symbol_key" ON "AnalysisCache"("symbol");
CREATE INDEX "AnalysisCache_healthScore_idx" ON "AnalysisCache"("healthScore");
CREATE INDEX "AnalysisCache_valuationScore_idx" ON "AnalysisCache"("valuationScore");
`;

const conn = new Client();
conn.on('ready', () => {
  const scriptContent = \`
const db = require('better-sqlite3')('/var/www/premarketprice/prisma/data/premarket.db');
const sql = \\\`\${sqlCommands.replace(/\\n/g, ' ')}\\\`;

const statements = sql.split(';').map(s => s.trim()).filter(Boolean);
for (const stmt of statements) {
    try {
        db.prepare(stmt).run();
        console.log('Success: ', stmt.slice(0, 50));
    } catch(e) {
        if (!e.message.includes('already exists')) {
            console.error('Error on stmt:', stmt.slice(0, 50), e.message);
        } else {
            console.log('Already exists:', stmt.slice(0, 50));
        }
    }
}
console.log('Patch complete.');
\`;

  conn.exec(`node -e "${scriptContent.replace(/"/g, '\\"')}"`, (err, stream) => {
    let output = '';
    stream.on('close', () => {
      console.log(output);
      
      // Just restart PM2 right after to be safe against schema desyncs
      conn.exec('pm2 restart premarketprice', () => {
         conn.end();
      });
      
    }).on('data', d => output += d).stderr.on('data', d => output += d);
  });
}).connect({ host: '89.185.250.213', port: 22, username: 'root', password: 'CcO15gcCwu' });
