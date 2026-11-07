/**
 * PMP v3.1.3 Pilot Backfill Script
 * 
 * Target: Isolated SQLite test database (/tmp/pmp-pit-pilot.db)
 * Symbols: AAPL, NVDA, SIVB
 * 
 * Fetches:
 * 1. Finnhub financials-reported (annual + quarterly)
 * 2. SEC EDGAR official submissions (cross-verification)
 * 
 * Evaluates:
 * Point-in-Time financial state as of November 8, 2022, 09:30 EST.
 */

import Database from 'better-sqlite3';
import { parseEasternToUtc } from '../src/lib/quant/pit/timezone';
import {
  FinancialFilingRecord,
  getPointInTimeFinancialFiling,
  getPointInTimeFinancialUniverse,
} from '../src/lib/quant/pit/pit-filing-service';

const DB_PATH = '/tmp/pmp-pit-pilot.db';

import fs from 'fs';
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


const PILOT_SYMBOLS = [
  { symbol: 'AAPL', cik: '0000320193' },
  { symbol: 'NVDA', cik: '0001045810' },
  { symbol: 'SIVB', cik: '0000719739' },
];

function initTestDb(): Database.Database {
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  db.exec(`
    DROP TABLE IF EXISTS "FinancialFiling";

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
      "revenue" REAL,
      "netIncome" REAL,
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

// Concept mapping from US-GAAP XBRL to normalized fields
function extractConcepts(report: any) {
  const allItems = [
    ...(report.ic || []),
    ...(report.bs || []),
    ...(report.cf || []),
  ];

  const findConcept = (...patterns: string[]): number | null => {
    for (const pat of patterns) {
      const match = allItems.find(
        (item: any) =>
          item.concept &&
          (item.concept.toLowerCase().includes(pat.toLowerCase()) ||
            item.label?.toLowerCase() === pat.toLowerCase())
      );
      if (match && typeof match.value === 'number') {
        return match.value;
      }
    }
    return null;
  };

  const revenue = findConcept(
    'RevenueFromContractWithCustomerExcludingAssessedTax',
    'Revenues',
    'SalesRevenueNet',
    'TotalRevenuesAndOtherIncome'
  );

  const netIncome = findConcept(
    'NetIncomeLoss',
    'ProfitLoss',
    'NetIncomeLossAvailableToCommonStockholdersBasic'
  );

  const grossProfit = findConcept('GrossProfit');
  const ebit = findConcept('OperatingIncomeLoss');
  const operatingCashFlow = findConcept(
    'NetCashProvidedByUsedInOperatingActivities'
  );
  const capex = findConcept(
    'PaymentsToAcquirePropertyPlantAndEquipment',
    'PaymentsToAcquireProductiveAssets'
  );
  const totalAssets = findConcept('Assets');
  const totalLiabilities = findConcept('Liabilities');
  const totalEquity = findConcept(
    'StockholdersEquity',
    'StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest'
  );
  const currentAssets = findConcept('AssetsCurrent');
  const currentLiabilities = findConcept('LiabilitiesCurrent');
  const cashAndEquivalents = findConcept(
    'CashAndCashEquivalentsAtCarryingValue',
    'CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents'
  );
  const totalDebt = findConcept(
    'LongTermDebtAndCapitalLeaseObligations',
    'LongTermDebtNoncurrent',
    'DebtCurrent'
  );
  const sharesOutstanding = findConcept(
    'CommonStockSharesOutstanding',
    'WeightedAverageNumberOfSharesOutstandingBasic'
  );

  return {
    revenue,
    netIncome,
    ebit,
    grossProfit,
    operatingCashFlow,
    capex,
    totalAssets,
    totalLiabilities,
    currentAssets,
    currentLiabilities,
    totalEquity,
    sharesOutstanding,
    cashAndEquivalents,
    totalDebt,
  };
}

async function fetchFinnhubFilings(symbol: string, freq: 'annual' | 'quarterly') {
  const url = `https://finnhub.io/api/v1/stock/financials-reported?symbol=${symbol}&freq=${freq}&token=${FINNHUB_KEY}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Finnhub error HTTP ${res.status}: ${await res.text()}`);
  }
  const data = await res.json();
  return data.data || [];
}

async function fetchSecEdgarFilings(cik: string) {
  const url = `https://data.sec.gov/submissions/CIK${cik}.json`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'PMP Quant Research info@premarketprice.com' },
  });
  if (!res.ok) return [];
  const data = await res.json();
  const recent = data.filings?.recent;
  if (!recent) return [];

  const results: any[] = [];
  const forms = recent.form || [];
  for (let i = 0; i < forms.length; i++) {
    if (['10-K', '10-Q', '10-K/A', '10-Q/A'].includes(forms[i])) {
      results.push({
        form: forms[i],
        accession: recent.accessionNumber[i],
        filingDate: recent.filingDate[i],
        reportDate: recent.reportDate[i],
        acceptanceDateTime: recent.acceptanceDateTime[i], // Already UTC ISO
      });
    }
  }
  return results;
}

async function run() {
  console.log('================================================================');
  console.log(' PMP v3.1.3 PILOT BACKFILL: AAPL, NVDA, SIVB');
  console.log(' Database:', DB_PATH);
  console.log('================================================================\n');

  const db = initTestDb();

  const insertStmt = db.prepare(`
    INSERT OR IGNORE INTO "FinancialFiling" (
      "id", "symbol", "accessNumber", "cik", "form", "isAmendment",
      "fiscalYear", "fiscalPeriod", "period", "startDate", "endDate",
      "filedDate", "acceptedDate", "availableAt", "rawAcceptedStr",
      "rawTimezone", "source", "revenue", "netIncome", "ebit", "grossProfit",
      "operatingCashFlow", "capex", "totalAssets", "totalLiabilities",
      "currentAssets", "currentLiabilities", "totalEquity", "sharesOutstanding",
      "cashAndEquivalents", "totalDebt", "rawReportJson"
    ) VALUES (
      @id, @symbol, @accessNumber, @cik, @form, @isAmendment,
      @fiscalYear, @fiscalPeriod, @period, @startDate, @endDate,
      @filedDate, @acceptedDate, @availableAt, @rawAcceptedStr,
      @rawTimezone, @source, @revenue, @netIncome, @ebit, @grossProfit,
      @operatingCashFlow, @capex, @totalAssets, @totalLiabilities,
      @currentAssets, @currentLiabilities, @totalEquity, @sharesOutstanding,
      @cashAndEquivalents, @totalDebt, @rawReportJson
    )
  `);

  const summary: Record<string, any> = {};

  for (const item of PILOT_SYMBOLS) {
    const sym = item.symbol;
    console.log(`\n>>> Processing Symbol: ${sym} (CIK: ${item.cik})`);

    // 1. Fetch from Finnhub
    console.log(`  Fetching Finnhub annual filings...`);
    const annualFilings = await fetchFinnhubFilings(sym, 'annual');
    await new Promise((r) => setTimeout(r, 1200));

    console.log(`  Fetching Finnhub quarterly filings...`);
    const quarterlyFilings = await fetchFinnhubFilings(sym, 'quarterly');
    await new Promise((r) => setTimeout(r, 1200));

    // 2. Fetch from SEC EDGAR official submissions
    console.log(`  Fetching SEC EDGAR official submissions...`);
    const edgarFilings = await fetchSecEdgarFilings(item.cik);
    await new Promise((r) => setTimeout(r, 800));

    const totalRaw = annualFilings.length + quarterlyFilings.length;
    console.log(
      `  Finnhub: ${annualFilings.length} annual, ${quarterlyFilings.length} quarterly (${totalRaw} total)`
    );
    console.log(`  SEC EDGAR periodic submissions: ${edgarFilings.length}`);

    // Ingest into test DB
    let importedCount = 0;
    let duplicateCount = 0;
    const allIngestedRecords: FinancialFilingRecord[] = [];

    const rawList = [...annualFilings, ...quarterlyFilings];
    for (const raw of rawList) {
      const isAmendment = raw.form.includes('/A');
      const fiscalPeriod =
        raw.form === '10-K' || raw.quarter === 0 || raw.quarter === 4
          ? 'FY'
          : `Q${raw.quarter}`;
      const period = `${raw.year}${fiscalPeriod}`;

      // Timezone conversion via America/New_York
      const tzParsed = parseEasternToUtc(raw.acceptedDate);
      const acceptedDate = tzParsed.utcDate;
      const availableAt = tzParsed.utcDate; // Baseline availability instant

      const concepts = extractConcepts(raw.report || {});

      const id = `filing_${sym}_${raw.accessNumber.replace(/[^a-zA-Z0-9]/g, '')}`;

      const filingRecord: FinancialFilingRecord = {
        id,
        symbol: sym,
        accessNumber: raw.accessNumber,
        cik: raw.cik || item.cik,
        form: raw.form,
        isAmendment,
        fiscalYear: raw.year,
        fiscalPeriod,
        period,
        startDate: raw.startDate ? new Date(raw.startDate) : null,
        endDate: new Date(raw.endDate),
        filedDate: raw.filedDate ? new Date(raw.filedDate) : null,
        acceptedDate,
        availableAt,
        rawAcceptedStr: raw.acceptedDate,
        rawTimezone: 'America/New_York',
        source: 'FINNHUB_SEC',
        ...concepts,
      };

      const result = insertStmt.run({
        id: filingRecord.id,
        symbol: filingRecord.symbol,
        accessNumber: filingRecord.accessNumber,
        cik: filingRecord.cik,
        form: filingRecord.form,
        isAmendment: filingRecord.isAmendment ? 1 : 0,
        fiscalYear: filingRecord.fiscalYear,
        fiscalPeriod: filingRecord.fiscalPeriod,
        period: filingRecord.period,
        startDate: filingRecord.startDate?.toISOString() || null,
        endDate: filingRecord.endDate.toISOString(),
        filedDate: filingRecord.filedDate?.toISOString() || null,
        acceptedDate: filingRecord.acceptedDate.toISOString(),
        availableAt: filingRecord.availableAt.toISOString(),
        rawAcceptedStr: filingRecord.rawAcceptedStr,
        rawTimezone: filingRecord.rawTimezone,
        source: filingRecord.source,
        revenue: filingRecord.revenue,
        netIncome: filingRecord.netIncome,
        ebit: filingRecord.ebit,
        grossProfit: filingRecord.grossProfit,
        operatingCashFlow: filingRecord.operatingCashFlow,
        capex: filingRecord.capex,
        totalAssets: filingRecord.totalAssets,
        totalLiabilities: filingRecord.totalLiabilities,
        currentAssets: filingRecord.currentAssets,
        currentLiabilities: filingRecord.currentLiabilities,
        totalEquity: filingRecord.totalEquity,
        sharesOutstanding: filingRecord.sharesOutstanding,
        cashAndEquivalents: filingRecord.cashAndEquivalents,
        totalDebt: filingRecord.totalDebt,
        rawReportJson: null,
      });

      if (result.changes > 0) {
        importedCount++;
        allIngestedRecords.push(filingRecord);
      } else {
        duplicateCount++;
      }
    }

    console.log(
      `  -> Ingestion: ${importedCount} imported, ${duplicateCount} duplicates skipped.`
    );

    // Cross-check with SEC EDGAR accession numbers
    const finnhubAccessions = new Set(rawList.map((r) => r.accessNumber));
    const edgarAccessions = new Set(edgarFilings.map((e) => e.accession));

    let matchedInBoth = 0;
    let edgarOnly = 0;
    for (const edg of edgarFilings) {
      if (finnhubAccessions.has(edg.accession)) {
        matchedInBoth++;
      } else {
        edgarOnly++;
      }
    }

    console.log(
      `  -> SEC EDGAR match: ${matchedInBoth} matched, ${edgarOnly} EDGAR-only (historical or post-delisting)`
    );

    summary[sym] = {
      finnhubRawCount: totalRaw,
      importedCount,
      duplicateCount,
      edgarPeriodicCount: edgarFilings.length,
      matchedInBoth,
      edgarOnly,
      records: allIngestedRecords,
    };
  }

  // ---------------------------------------------------------------------------
  // POINT-IN-TIME RECONSTRUCTION: 2022-11-08 09:30:00 EST
  // ---------------------------------------------------------------------------
  console.log('\n================================================================');
  console.log(' POINT-IN-TIME RECONSTRUCTION AT: 2022-11-08 09:30:00 EST');
  console.log(' UTC Instant: 2022-11-08T14:30:00.000Z');
  console.log('================================================================\n');

  const asOf = parseEasternToUtc('2022-11-08 09:30:00').utcDate;

  for (const item of PILOT_SYMBOLS) {
    const sym = item.symbol;
    const filings: FinancialFilingRecord[] = summary[sym].records;

    // Latest Periodic Filing (10-K or 10-Q) available at asOf
    const latestFiling = getPointInTimeFinancialFiling(filings, {
      symbol: sym,
      asOf,
    });

    // Latest Annual Filing (10-K) available at asOf
    const latestAnnual = getPointInTimeFinancialFiling(filings, {
      symbol: sym,
      asOf,
      periodType: 'ANNUAL',
    });

    // Reconstruct full historical universe available at asOf
    const universe = getPointInTimeFinancialUniverse(filings, sym, asOf);

    console.log(`----------------------------------------------------------------`);
    console.log(`SYMBOL: ${sym}`);
    console.log(`  Total Historical Filings Available <= asOf: ${universe.length}`);
    if (latestFiling) {
      console.log(`  LATEST AVAILABLE PERIODIC FILING:`);
      console.log(`    Form:           ${latestFiling.form}`);
      console.log(`    Period:         ${latestFiling.fiscalYear} ${latestFiling.fiscalPeriod} (end: ${latestFiling.endDate.toISOString().split('T')[0]})`);
      console.log(`    SEC Accession:  ${latestFiling.accessNumber}`);
      console.log(`    EDGAR Accepted: ${latestFiling.rawAcceptedStr} ET (${latestFiling.acceptedDate.toISOString()})`);
      console.log(`    Revenue:        $${(latestFiling.revenue ? (latestFiling.revenue / 1e9).toFixed(3) + 'B' : 'N/A')}`);
      console.log(`    Net Income:     $${(latestFiling.netIncome ? (latestFiling.netIncome / 1e9).toFixed(3) + 'B' : 'N/A')}`);
      console.log(`    Cash & Equiv:   $${(latestFiling.cashAndEquivalents ? (latestFiling.cashAndEquivalents / 1e9).toFixed(3) + 'B' : 'N/A')}`);
      console.log(`    Total Debt:     $${(latestFiling.totalDebt ? (latestFiling.totalDebt / 1e9).toFixed(3) + 'B' : 'N/A')}`);
      console.log(`    Shares Out:     ${(latestFiling.sharesOutstanding ? (latestFiling.sharesOutstanding / 1e6).toFixed(1) + 'M' : 'N/A')}`);
    } else {
      console.log(`  NO FILING AVAILABLE!`);
    }

    if (latestAnnual && latestAnnual.id !== latestFiling?.id) {
      console.log(`  LATEST AVAILABLE ANNUAL (10-K):`);
      console.log(`    Period:         ${latestAnnual.fiscalYear} FY (end: ${latestAnnual.endDate.toISOString().split('T')[0]})`);
      console.log(`    SEC Accession:  ${latestAnnual.accessNumber}`);
      console.log(`    Revenue:        $${(latestAnnual.revenue ? (latestAnnual.revenue / 1e9).toFixed(3) + 'B' : 'N/A')}`);
      console.log(`    Net Income:     $${(latestAnnual.netIncome ? (latestAnnual.netIncome / 1e9).toFixed(3) + 'B' : 'N/A')}`);
    }
  }

  db.close();
  console.log('\n================================================================');
  console.log(' PILOT BACKFILL & PIT RECONSTRUCTION COMPLETE');
  console.log('================================================================');
}

run().catch((e) => {
  console.error('Fatal error:', e);
  process.exit(1);
});
