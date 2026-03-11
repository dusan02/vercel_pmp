const { Client } = require('ssh2');
const fs = require('fs');

const sqlCommands = `
CREATE TABLE IF NOT EXISTS "DailyValuationHistory" (
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

CREATE TABLE IF NOT EXISTS "AnalysisCache" (
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

CREATE UNIQUE INDEX IF NOT EXISTS "DailyValuationHistory_symbol_date_key" ON "DailyValuationHistory"("symbol", "date");
CREATE INDEX IF NOT EXISTS "DailyValuationHistory_symbol_idx" ON "DailyValuationHistory"("symbol");
CREATE INDEX IF NOT EXISTS "DailyValuationHistory_date_idx" ON "DailyValuationHistory"("date");

CREATE UNIQUE INDEX IF NOT EXISTS "AnalysisCache_symbol_key" ON "AnalysisCache"("symbol");
CREATE INDEX IF NOT EXISTS "AnalysisCache_healthScore_idx" ON "AnalysisCache"("healthScore");
CREATE INDEX IF NOT EXISTS "AnalysisCache_valuationScore_idx" ON "AnalysisCache"("valuationScore");
`;

fs.writeFileSync('D:\\\\Projects\\\\Vercel_PMP\\\\pmp_prod\\\\scripts\\\\remote_patch.js', \`
const db = require('better-sqlite3')('/var/www/premarketprice/prisma/data/premarket.db');
const stmts = \${JSON.stringify(sqlCommands.split(';').map(s => s.trim()).filter(Boolean))};
for (const stmt of stmts) {
    try {
        db.prepare(stmt).run();
        console.log('Success stmt');
    } catch(e) {
        if (!e.message.includes('already exists')) {
            console.error('Error stmt:', e.message);
        }
    }
}
console.log('Patch complete.');
\`);

const conn = new Client();
conn.on('ready', () => {
    conn.sftp((err, sftp) => {
        if(err) throw err;
        sftp.fastPut('D:\\\\Projects\\\\Vercel_PMP\\\\pmp_prod\\\\scripts\\\\remote_patch.js', '/var/www/premarketprice/scripts/remote_patch.js', (uploadErr) => {
            if(uploadErr) throw uploadErr;
            conn.exec('cd /var/www/premarketprice && node scripts/remote_patch.js && pm2 restart premarketprice', (execErr, stream) => {
                if(execErr) throw execErr;
                stream.on('close', () => {
                   console.log('Done!');
                   conn.end();
                }).on('data', d => console.log(''+d)).stderr.on('data', d => console.error(''+d));
            });
        });
    });
}).connect({ host: '89.185.250.213', port: 22, username: 'root', password: 'CcO15gcCwu' });
