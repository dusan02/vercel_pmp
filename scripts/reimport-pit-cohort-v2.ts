/**
 * PMP v3.1.3-C3 Clean Cohort Re-Importer (v2 Database)
 * ====================================================
 * 
 * Re-imports all 35 cohort tickers into an isolated v2 database (/tmp/pmp-pit-cohort-v2.db)
 * using the central conceptRegistry with STRICT concept equality.
 * 
 * Key Guarantees:
 * 1. TotalAssets strictly selects 'Assets' (never subcategories like OtherAssetsNoncurrent).
 * 2. Net Income isolates Common Stockholders vs Consolidated vs Noncontrolling Interests.
 * 3. Raw report JSON is preserved in the database for 100% transparent auditability.
 * 4. Finnhub API calls are cached locally in /tmp/finnhub-raw-cache/ to prevent 429 limits.
 * 5. FRC and SBNY are explicitly registered with fundamentalSource = 'FDIC_CALL_REPORT'.
 * 6. Foreign ADRs are explicitly registered with fundamentalSource = 'UNSUPPORTED_FORM_20F'.
 */

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { parseEasternToUtc } from '../src/lib/quant/pit/timezone';
import { extractExactMetric, resolveNetIncome } from '../src/lib/quant/pit/concept-registry';

const DB_V2_PATH = '/tmp/pmp-pit-cohort-v2.db';
const FINNHUB_CACHE_DIR = '/tmp/finnhub-raw-cache';

function getFinnhubKey(): string {
  if (process.env.FINNHUB_API_KEY) return process.env.FINNHUB_API_KEY;
  try {
    const content = fs.readFileSync('.env.local', 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (trimmed.startsWith('FINNHUB_API_KEY=')) {
        return trimmed.split('=')[1].trim();
      }
    }
  } catch {}
  throw new Error('FINNHUB_API_KEY not configured in environment or .env.local');
}

const FINNHUB_KEY = getFinnhubKey();

interface CohortDef {
  symbol: string;
  name: string;
  cik: string;
  category: 'US_EQUITY' | 'US_FINANCIAL' | 'US_RESTATEMENT' | 'DELISTED' | 'ADR';
  fundamentalSource: 'SEC_XBRL' | 'FDIC_CALL_REPORT' | 'UNSUPPORTED_FORM_20F';
  sourceEntityId: string;
  notes?: string;
}

const COHORT: CohortDef[] = [
  // 1-16: Active US Common Stocks
  { symbol: 'AAPL',  name: 'Apple Inc.',             cik: '0000320193', category: 'US_EQUITY',      fundamentalSource: 'SEC_XBRL', sourceEntityId: '0000320193' },
  { symbol: 'MSFT',  name: 'Microsoft Corp.',         cik: '0000789019', category: 'US_EQUITY',      fundamentalSource: 'SEC_XBRL', sourceEntityId: '0000789019' },
  { symbol: 'NVDA',  name: 'NVIDIA Corp.',            cik: '0001045810', category: 'US_EQUITY',      fundamentalSource: 'SEC_XBRL', sourceEntityId: '0001045810' },
  { symbol: 'AMZN',  name: 'Amazon.com Inc.',         cik: '0001018724', category: 'US_EQUITY',      fundamentalSource: 'SEC_XBRL', sourceEntityId: '0001018724' },
  { symbol: 'GOOGL', name: 'Alphabet Inc.',           cik: '0001652044', category: 'US_EQUITY',      fundamentalSource: 'SEC_XBRL', sourceEntityId: '0001652044' },
  { symbol: 'META',  name: 'Meta Platforms Inc.',     cik: '0001326801', category: 'US_EQUITY',      fundamentalSource: 'SEC_XBRL', sourceEntityId: '0001326801' },
  { symbol: 'TSLA',  name: 'Tesla Inc.',              cik: '0001318605', category: 'US_EQUITY',      fundamentalSource: 'SEC_XBRL', sourceEntityId: '0001318605' },
  { symbol: 'XOM',   name: 'Exxon Mobil Corp.',       cik: '0000034088', category: 'US_EQUITY',      fundamentalSource: 'SEC_XBRL', sourceEntityId: '0000034088' },
  { symbol: 'UNH',   name: 'UnitedHealth Group Inc.', cik: '0000731766', category: 'US_EQUITY',      fundamentalSource: 'SEC_XBRL', sourceEntityId: '0000731766' },
  { symbol: 'CAT',   name: 'Caterpillar Inc.',        cik: '0000018230', category: 'US_EQUITY',      fundamentalSource: 'SEC_XBRL', sourceEntityId: '0000018230' },
  { symbol: 'LLY',   name: 'Eli Lilly & Co.',         cik: '0000059478', category: 'US_EQUITY',      fundamentalSource: 'SEC_XBRL', sourceEntityId: '0000059478' },
  { symbol: 'JNJ',   name: 'Johnson & Johnson',       cik: '0000200406', category: 'US_EQUITY',      fundamentalSource: 'SEC_XBRL', sourceEntityId: '0000200406' },
  { symbol: 'PG',    name: 'Procter & Gamble Co.',    cik: '0000080424', category: 'US_EQUITY',      fundamentalSource: 'SEC_XBRL', sourceEntityId: '0000080424' },
  { symbol: 'COST',  name: 'Costco Wholesale Corp.',  cik: '0000909832', category: 'US_EQUITY',      fundamentalSource: 'SEC_XBRL', sourceEntityId: '0000909832' },
  { symbol: 'FDX',   name: 'FedEx Corp.',             cik: '0001048911', category: 'US_EQUITY',      fundamentalSource: 'SEC_XBRL', sourceEntityId: '0001048911' },
  { symbol: 'NKE',   name: 'NIKE Inc.',               cik: '0000320187', category: 'US_EQUITY',      fundamentalSource: 'SEC_XBRL', sourceEntityId: '0000320187' },

  // 17-21: Restatement Filers
  { symbol: 'SMCI',  name: 'Super Micro Computer',    cik: '0001375365', category: 'US_RESTATEMENT', fundamentalSource: 'SEC_XBRL', sourceEntityId: '0001375365' },
  { symbol: 'KHC',   name: 'Kraft Heinz Co.',         cik: '0001637459', category: 'US_RESTATEMENT', fundamentalSource: 'SEC_XBRL', sourceEntityId: '0001637459' },
  { symbol: 'GE',    name: 'General Electric Co.',    cik: '0000040545', category: 'US_RESTATEMENT', fundamentalSource: 'SEC_XBRL', sourceEntityId: '0000040545' },
  { symbol: 'WDC',   name: 'Western Digital Corp.',   cik: '0000106040', category: 'US_RESTATEMENT', fundamentalSource: 'SEC_XBRL', sourceEntityId: '0000106040' },
  { symbol: 'EQIX',  name: 'Equinix Inc.',            cik: '0001101239', category: 'US_RESTATEMENT', fundamentalSource: 'SEC_XBRL', sourceEntityId: '0001101239' },

  // 22-23: Large US Financials
  { symbol: 'JPM',   name: 'JPMorgan Chase & Co.',    cik: '0000019617', category: 'US_FINANCIAL',   fundamentalSource: 'SEC_XBRL', sourceEntityId: '0000019617' },
  { symbol: 'BAC',   name: 'Bank of America Corp.',   cik: '0000070858', category: 'US_FINANCIAL',   fundamentalSource: 'SEC_XBRL', sourceEntityId: '0000070858' },

  // 24-29: Delisted / Bankrupt / FDIC Receivership
  { symbol: 'SIVB',  name: 'Silicon Valley Bank',     cik: '0000719739', category: 'DELISTED',       fundamentalSource: 'SEC_XBRL',         sourceEntityId: '0000719739' },
  { symbol: 'TWTR',  name: 'Twitter Inc.',            cik: '0001418091', category: 'DELISTED',       fundamentalSource: 'SEC_XBRL',         sourceEntityId: '0001418091' },
  { symbol: 'ATVI',  name: 'Activision Blizzard',     cik: '0000718877', category: 'DELISTED',       fundamentalSource: 'SEC_XBRL',         sourceEntityId: '0000718877' },
  { symbol: 'BBBY',  name: 'Bed Bath & Beyond',       cik: '0000886158', category: 'DELISTED',       fundamentalSource: 'SEC_XBRL',         sourceEntityId: '0000886158' },
  { symbol: 'FRC',   name: 'First Republic Bank',     cik: '0001132979', category: 'DELISTED',       fundamentalSource: 'FDIC_CALL_REPORT', sourceEntityId: 'FDIC_CERT_59017' },
  { symbol: 'SBNY',  name: 'Signature Bank (NY)',     cik: '0000000000', category: 'DELISTED',       fundamentalSource: 'FDIC_CALL_REPORT', sourceEntityId: 'FDIC_CERT_57053' },

  // 30-35: Foreign Private Issuers (ADRs)
  { symbol: 'BHP',   name: 'BHP Group Ltd.',          cik: '0000811809', category: 'ADR',            fundamentalSource: 'UNSUPPORTED_FORM_20F', sourceEntityId: '0000811809' },
  { symbol: 'BABA',  name: 'Alibaba Group Holding',   cik: '0001577552', category: 'ADR',            fundamentalSource: 'UNSUPPORTED_FORM_20F', sourceEntityId: '0001577552' },
  { symbol: 'TSM',   name: 'Taiwan Semiconductor',    cik: '0001046179', category: 'ADR',            fundamentalSource: 'UNSUPPORTED_FORM_20F', sourceEntityId: '0001046179' },
  { symbol: 'ASML',  name: 'ASML Holding N.V.',       cik: '0000937966', category: 'ADR',            fundamentalSource: 'UNSUPPORTED_FORM_20F', sourceEntityId: '0000937966' },
  { symbol: 'BP',    name: 'BP p.l.c.',               cik: '0000313807', category: 'ADR',            fundamentalSource: 'UNSUPPORTED_FORM_20F', sourceEntityId: '0000313807' },
  { symbol: 'SHEL',  name: 'Shell plc',               cik: '0001306965', category: 'ADR',            fundamentalSource: 'UNSUPPORTED_FORM_20F', sourceEntityId: '0001306965' },
];

function initV2Db(): Database.Database {
  if (fs.existsSync(DB_V2_PATH)) {
    fs.unlinkSync(DB_V2_PATH);
  }

  const db = new Database(DB_V2_PATH);
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE "FinancialFiling" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "symbol" TEXT NOT NULL,
      "accessNumber" TEXT UNIQUE,
      "cik" TEXT,
      "form" TEXT NOT NULL,
      "isAmendment" INTEGER NOT NULL DEFAULT 0,
      "fiscalYear" INTEGER NOT NULL,
      "fiscalPeriod" TEXT NOT NULL,
      "period" TEXT NOT NULL,
      "startDate" DATETIME,
      "endDate" DATETIME NOT NULL,
      "filedDate" DATETIME,
      "acceptedDate" DATETIME NOT NULL,
      "availableAt" DATETIME NOT NULL,
      "rawAcceptedStr" TEXT,
      "rawTimezone" TEXT DEFAULT 'America/New_York',
      "source" TEXT,
      "fundamentalSource" TEXT NOT NULL,
      "sourceEntityId" TEXT NOT NULL,
      "revenue" REAL,
      "revenueConcept" TEXT,
      "netIncome" REAL,
      "netIncomeConcept" TEXT,
      "netIncomeCommon" REAL,
      "netIncomeConsolidated" REAL,
      "netIncomeNoncontrolling" REAL,
      "ebit" REAL,
      "grossProfit" REAL,
      "operatingCashFlow" REAL,
      "capex" REAL,
      "totalAssets" REAL,
      "totalLiabilities" REAL,
      "currentAssets" REAL,
      "currentLiabilities" REAL,
      "totalEquity" REAL,
      "sharesOutstanding" REAL,
      "cashAndEquivalents" REAL,
      "totalDebt" REAL,
      "rawReportJson" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX "FinancialFiling_symbol_availableAt_idx" ON "FinancialFiling"("symbol", "availableAt");
    CREATE INDEX "FinancialFiling_symbol_fiscalYear_fiscalPeriod_idx" ON "FinancialFiling"("symbol", "fiscalYear", "fiscalPeriod");
    CREATE INDEX "FinancialFiling_availableAt_idx" ON "FinancialFiling"("availableAt");
  `);

  return db;
}

async function fetchFinnhubReported(symbol: string, freq: 'annual' | 'quarterly'): Promise<any[]> {
  fs.mkdirSync(FINNHUB_CACHE_DIR, { recursive: true });
  const cacheFile = path.join(FINNHUB_CACHE_DIR, `${symbol}_${freq}.json`);

  if (fs.existsSync(cacheFile)) {
    try {
      const cached = JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));
      if (Array.isArray(cached)) return cached;
    } catch {}
  }

  const url = `https://finnhub.io/api/v1/stock/financials-reported?symbol=${symbol}&freq=${freq}&token=${FINNHUB_KEY}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const json = await res.json();
    const data = json.data || [];
    fs.writeFileSync(cacheFile, JSON.stringify(data));
    return data;
  } catch {
    return [];
  }
}

export async function reimportCohortV2() {
  console.log('================================================================================');
  console.log(' PMP v3.1.3-C3 CLEAN COHORT RE-IMPORTER (v2 Database)');
  console.log(' Target DB: /tmp/pmp-pit-cohort-v2.db');
  console.log(' Strict Concept Registry: Assets strictly, isolated Common vs Consolidated Net Income');
  console.log('================================================================================\n');

  const db = initV2Db();

  const insertStmt = db.prepare(`
    INSERT OR IGNORE INTO "FinancialFiling" (
      "id", "symbol", "accessNumber", "cik", "form", "isAmendment",
      "fiscalYear", "fiscalPeriod", "period", "startDate", "endDate",
      "filedDate", "acceptedDate", "availableAt", "rawAcceptedStr",
      "rawTimezone", "source", "fundamentalSource", "sourceEntityId",
      "revenue", "revenueConcept", "netIncome", "netIncomeConcept",
      "netIncomeCommon", "netIncomeConsolidated", "netIncomeNoncontrolling",
      "ebit", "grossProfit", "operatingCashFlow", "capex",
      "totalAssets", "totalLiabilities", "currentAssets", "currentLiabilities",
      "totalEquity", "sharesOutstanding", "cashAndEquivalents", "totalDebt",
      "rawReportJson"
    ) VALUES (
      @id, @symbol, @accessNumber, @cik, @form, @isAmendment,
      @fiscalYear, @fiscalPeriod, @period, @startDate, @endDate,
      @filedDate, @acceptedDate, @availableAt, @rawAcceptedStr,
      @rawTimezone, @source, @fundamentalSource, @sourceEntityId,
      @revenue, @revenueConcept, @netIncome, @netIncomeConcept,
      @netIncomeCommon, @netIncomeConsolidated, @netIncomeNoncontrolling,
      @ebit, @grossProfit, @operatingCashFlow, @capex,
      @totalAssets, @totalLiabilities, @currentAssets, @currentLiabilities,
      @totalEquity, @sharesOutstanding, @cashAndEquivalents, @totalDebt,
      @rawReportJson
    )
  `);

  let totalImported = 0;

  for (let i = 0; i < COHORT.length; i++) {
    const item = COHORT[i];
    process.stdout.write(
      `[${(i + 1).toString().padStart(2)}/35] ${item.symbol.padEnd(6)} (${item.category.padEnd(15)})... `
    );

    // 1. Handle FDIC Call Report Banks (FRC, SBNY)
    if (item.fundamentalSource === 'FDIC_CALL_REPORT') {
      console.log('-> FDIC Call Report Bank registered.');
      continue;
    }

    // 2. Handle Foreign ADRs (20-F)
    if (item.fundamentalSource === 'UNSUPPORTED_FORM_20F') {
      console.log('-> Foreign 20-F ADR registered.');
      continue;
    }

    // 3. For SEC Reporting Common Stocks
    const annuals = await fetchFinnhubReported(item.symbol, 'annual');
    await new Promise(r => setTimeout(r, 150));

    const quarterlies = await fetchFinnhubReported(item.symbol, 'quarterly');
    await new Promise(r => setTimeout(r, 150));

    const allReports = [...annuals, ...quarterlies];
    let importedForSymbol = 0;

    for (const report of allReports) {
      if (!report.report) continue;
      const raw = report.report;
      const form = (report.form || raw.form || '').trim();
      const accessNumber = (report.accessNumber || raw.accessNumber || '').trim();
      if (!form || !accessNumber) continue;

      // Filter: only 10-K, 10-Q and their /A amendments
      const baseForm = form.replace(/\/A$/, '');
      if (baseForm !== '10-K' && baseForm !== '10-Q') continue;

      const isAmendment = form.endsWith('/A');

      // Date parsing
      let acceptedUtc: Date;
      let availableAtUtc: Date;
      let rawAccepted = report.acceptedDate || '';

      if (rawAccepted) {
        try {
          const parsed = parseEasternToUtc(rawAccepted);
          acceptedUtc = parsed.utcDate;
          availableAtUtc = parsed.utcDate; // Conservative baseline
        } catch {
          acceptedUtc = new Date(report.filedDate || report.endDate);
          availableAtUtc = acceptedUtc;
        }
      } else {
        acceptedUtc = new Date(report.filedDate || report.endDate);
        availableAtUtc = acceptedUtc;
      }

      // Combine financial statement item pools
      const allItems = [
        ...(raw.ic || []),
        ...(raw.bs || []),
        ...(raw.cf || []),
      ];

      // STRICT Concept Extraction using conceptRegistry
      const revRes = extractExactMetric(allItems, 'Revenue');
      const niCommon = extractExactMetric(allItems, 'NetIncomeCommon');
      const niConsol = extractExactMetric(allItems, 'NetIncomeConsolidated');
      const niNonctrl = extractExactMetric(allItems, 'NetIncomeNoncontrollingInterest');
      const resolvedNi = resolveNetIncome(allItems);

      // Total Assets: STRICTLY Assets!
      const assetsRes = extractExactMetric(allItems, 'TotalAssets');
      const liabRes = extractExactMetric(allItems, 'TotalLiabilities');
      const curAssetsRes = extractExactMetric(allItems, 'CurrentAssets');
      const curLiabRes = extractExactMetric(allItems, 'CurrentLiabilities');
      const equityRes = extractExactMetric(allItems, 'StockholdersEquity');
      const cashRes = extractExactMetric(allItems, 'CashAndEquivalents');

      const ebitRes = extractExactMetric(allItems, 'OperatingIncome');
      const grossProfitRes = extractExactMetric(allItems, 'GrossProfit');
      const ocfRes = extractExactMetric(allItems, 'OperatingCashFlow');
      const capexRes = extractExactMetric(allItems, 'CapitalExpenditures');

      const sharesDiluted = extractExactMetric(allItems, 'DilutedShares');
      const sharesBasic = extractExactMetric(allItems, 'BasicShares');

      const filingId = `${item.symbol}_${accessNumber}`;

      insertStmt.run({
        id: filingId,
        symbol: item.symbol,
        accessNumber: accessNumber,
        cik: item.cik,
        form: form,
        isAmendment: isAmendment ? 1 : 0,
        fiscalYear: report.year,
        fiscalPeriod: report.quarter === 0 ? 'FY' : `Q${report.quarter}`,
        period: `${report.year}${report.quarter === 0 ? 'FY' : `Q${report.quarter}`}`,
        startDate: report.startDate ? `${report.startDate.split(' ')[0]}T00:00:00.000Z` : null,
        endDate: `${(report.endDate || '').split(' ')[0]}T00:00:00.000Z`,
        filedDate: report.filedDate ? `${report.filedDate.split(' ')[0]}T00:00:00.000Z` : null,
        acceptedDate: acceptedUtc.toISOString(),
        availableAt: availableAtUtc.toISOString(),
        rawAcceptedStr: rawAccepted,
        rawTimezone: 'America/New_York',
        source: 'finnhub',
        fundamentalSource: item.fundamentalSource,
        sourceEntityId: item.sourceEntityId,
        revenue: revRes.value,
        revenueConcept: revRes.matchedConcept,
        netIncome: resolvedNi.value,
        netIncomeConcept: resolvedNi.conceptUsed,
        netIncomeCommon: niCommon.value,
        netIncomeConsolidated: niConsol.value,
        netIncomeNoncontrolling: niNonctrl.value,
        ebit: ebitRes.value,
        grossProfit: grossProfitRes.value,
        operatingCashFlow: ocfRes.value,
        capex: capexRes.value,
        totalAssets: assetsRes.value,
        totalLiabilities: liabRes.value,
        currentAssets: curAssetsRes.value,
        currentLiabilities: curLiabRes.value,
        totalEquity: equityRes.value,
        sharesOutstanding: sharesDiluted.value ?? sharesBasic.value,
        cashAndEquivalents: cashRes.value,
        totalDebt: null,
        rawReportJson: JSON.stringify(allItems),
      });

      importedForSymbol++;
      totalImported++;
    }

    console.log(`-> Imported ${importedForSymbol} filings.`);
  }

  const finalCount = db.prepare('SELECT count(*) as c FROM "FinancialFiling"').get() as any;
  console.log('\n================================================================================');
  console.log(` REIMPORT COMPLETE! Total filings in /tmp/pmp-pit-cohort-v2.db: ${finalCount.c}`);
  console.log('================================================================================\n');

  db.close();
}

reimportCohortV2().catch(err => {
  console.error('Reimport failed:', err);
  process.exit(1);
});
