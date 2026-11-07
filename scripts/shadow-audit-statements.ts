/**
 * PMP Financial Data Quality — Shadow Audit Tool
 * ==============================================
 * 
 * Strict Read-Only Audit of FinancialStatement rows in SQLite.
 * 
 * Rules:
 *  - NO DATABASE WRITES: opened with readonly: true.
 *  - Preserves legitimate negative equity (MCD, PM).
 *  - Flags inconsistencies without silent overwriting.
 *  - Compares stored values vs. methodologically rigorous definitions.
 *  - Outputs CSV with: ticker, fiscalPeriod, metric, oldValue, newValue, percentageDifference,
 *                      sourceConcept, sourceFiling, transformationApplied, validationStatus.
 * 
 * Usage:
 *  npx tsx scripts/shadow-audit-statements.ts [--db=path/to/premarket.db] [--limit=N] [--out=path/to/report.csv]
 */

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

interface CliArgs {
  dbPath: string;
  limit?: number;
  symbol?: string;
  outCsv: string;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  let dbPath = 'prisma/data/premarket.db';
  if (!fs.existsSync(dbPath)) {
    if (fs.existsSync('/var/www/premarketprice/prisma/data/premarket.db')) {
      dbPath = '/var/www/premarketprice/prisma/data/premarket.db';
    } else if (fs.existsSync('data/premarket.db')) {
      dbPath = 'data/premarket.db';
    }
  }

  let limit: number | undefined;
  let symbol: string | undefined;
  let outCsv = '/tmp/pmp-shadow-audit-report.csv';

  for (const arg of args) {
    if (arg.startsWith('--db=')) dbPath = arg.split('=')[1]!;
    if (arg.startsWith('--limit=')) limit = parseInt(arg.split('=')[1]!, 10);
    if (arg.startsWith('--symbol=')) symbol = arg.split('=')[1]!.toUpperCase();
    if (arg.startsWith('--out=')) outCsv = arg.split('=')[1]!;
  }

  return { dbPath, limit, symbol, outCsv };
}

interface ShadowAuditRecord {
  ticker: string;
  fiscalPeriod: string;
  metric: string;
  oldValue: string;
  newValue: string;
  percentageDifference: string;
  sourceConcept: string;
  sourceFiling: string;
  transformationApplied: string;
  validationStatus: string;
}

function runShadowAudit() {
  const { dbPath, limit, symbol, outCsv } = parseArgs();
  console.log(`[ShadowAudit] Opening database READ-ONLY: ${dbPath}`);

  if (!fs.existsSync(dbPath)) {
    console.error(`[ShadowAudit] Error: Database file not found at ${dbPath}`);
    process.exit(1);
  }

  const db = new Database(dbPath, { readonly: true });

  let query = `
    SELECT 
      symbol, fiscalYear, fiscalPeriod, endDate,
      revenue, netIncome, ebit, grossProfit, operatingCashFlow, capex,
      totalAssets, totalLiabilities, currentAssets, currentLiabilities,
      retainedEarnings, totalEquity, sharesOutstanding
    FROM FinancialStatement
  `;
  const params: any[] = [];

  if (symbol) {
    query += ` WHERE symbol = ?`;
    params.push(symbol);
  }

  query += ` ORDER BY symbol ASC, fiscalYear DESC, fiscalPeriod DESC`;

  if (limit) {
    query += ` LIMIT ?`;
    params.push(limit);
  }

  const rows = db.prepare(query).all(...params) as any[];
  console.log(`[ShadowAudit] Loaded ${rows.length} statements for shadow audit.`);

  const auditRecords: ShadowAuditRecord[] = [];
  let consistentCount = 0;
  let negativeEquityCount = 0;
  let inconsistentCount = 0;
  let missingComponentCount = 0;
  let negativeCapexCount = 0;

  for (const r of rows) {
    const periodStr = `${r.fiscalPeriod}/${r.fiscalYear}`;
    const filingRef = r.endDate ? String(r.endDate).substring(0, 10) : 'N/A';

    // 1. Balance Sheet Audit
    const ta = r.totalAssets;
    const tl = r.totalLiabilities;
    const te = r.totalEquity;

    if (ta !== null && tl !== null && te !== null) {
      if (te < 0) {
        negativeEquityCount++;
      }
      const sum = tl + te;
      const diff = Math.abs(ta - sum);
      const tolerance = Math.max(1000, Math.abs(ta) * 0.01); // 1% or $1,000

      if (diff <= tolerance) {
        consistentCount++;
        // If legitimate negative equity, document it explicitly
        if (te < 0) {
          auditRecords.push({
            ticker: r.symbol,
            fiscalPeriod: periodStr,
            metric: 'totalEquity',
            oldValue: String(te),
            newValue: String(te),
            percentageDifference: '0.00%',
            sourceConcept: 'StockholdersEquity (Preserved)',
            sourceFiling: filingRef,
            transformationApplied: 'PRESERVED_LEGITIMATE_NEGATIVE_EQUITY',
            validationStatus: 'VALID_CONSISTENT',
          });
        }
      } else {
        inconsistentCount++;
        const pctDiff = ta !== 0 ? ((diff / Math.abs(ta)) * 100).toFixed(2) : 'N/A';
        auditRecords.push({
          ticker: r.symbol,
          fiscalPeriod: periodStr,
          metric: 'BalanceSheetEquation',
          oldValue: `Assets=${ta}, Liab=${tl}, Eq=${te}`,
          newValue: `Assets=${ta}, Liab+Eq=${sum}`,
          percentageDifference: `${pctDiff}%`,
          sourceConcept: 'Assets != Liabilities + Equity',
          sourceFiling: filingRef,
          transformationApplied: 'RETAINED_UNMODIFIED_INCONSISTENCY',
          validationStatus: 'INCONSISTENT_BALANCE',
        });
      }
    } else {
      // Incomplete balance sheet: evaluate proposed derivation (without applying it)
      if (ta !== null && te !== null && tl === null) {
        missingComponentCount++;
        const derivedLiab = ta - te;
        auditRecords.push({
          ticker: r.symbol,
          fiscalPeriod: periodStr,
          metric: 'totalLiabilities',
          oldValue: 'NULL',
          newValue: String(derivedLiab),
          percentageDifference: 'N/A',
          sourceConcept: 'Derived(Assets - Equity)',
          sourceFiling: filingRef,
          transformationApplied: 'PROPOSED_DERIVATION_ONLY_DRY_RUN',
          validationStatus: 'DERIVED_MISSING_COMPONENT',
        });
      } else if (ta !== null && tl !== null && te === null) {
        missingComponentCount++;
        const derivedEq = ta - tl;
        auditRecords.push({
          ticker: r.symbol,
          fiscalPeriod: periodStr,
          metric: 'totalEquity',
          oldValue: 'NULL',
          newValue: String(derivedEq),
          percentageDifference: 'N/A',
          sourceConcept: 'Derived(Assets - Liabilities)',
          sourceFiling: filingRef,
          transformationApplied: 'PROPOSED_DERIVATION_ONLY_DRY_RUN',
          validationStatus: 'DERIVED_MISSING_COMPONENT',
        });
      }
    }

    // 2. Capex Outflow Convention Audit
    if (r.capex !== null && r.capex < 0) {
      negativeCapexCount++;
      auditRecords.push({
        ticker: r.symbol,
        fiscalPeriod: periodStr,
        metric: 'capex',
        oldValue: String(r.capex),
        newValue: String(Math.abs(r.capex)),
        percentageDifference: '0.00%',
        sourceConcept: 'PaymentsToAcquirePropertyPlantAndEquipment',
        sourceFiling: filingRef,
        transformationApplied: 'NORMALIZATION_TO_POSITIVE_EXPENDITURE',
        validationStatus: 'NEGATIVE_CAPEX_ANOMALY',
      });
    }

    // 3. Operating Cash Flow & Free Cash Flow Sanity
    if (r.operatingCashFlow !== null && r.capex !== null) {
      const fcfStored = r.operatingCashFlow - Math.abs(r.capex);
      // If capex was negative, old naive subtraction OCF - capex would have yielded OCF + |capex|
      if (r.capex < 0) {
        const erroneousNaiveFcf = r.operatingCashFlow - r.capex;
        auditRecords.push({
          ticker: r.symbol,
          fiscalPeriod: periodStr,
          metric: 'freeCashFlow',
          oldValue: String(erroneousNaiveFcf),
          newValue: String(fcfStored),
          percentageDifference: ((Math.abs(erroneousNaiveFcf - fcfStored) / (Math.abs(fcfStored) || 1)) * 100).toFixed(2) + '%',
          sourceConcept: 'FCF = OCF - Capex',
          sourceFiling: filingRef,
          transformationApplied: 'PROTECT_FCF_SUBTRACTION_FROM_SIGN_REVERSAL',
          validationStatus: 'FCF_REPAIR_IDENTIFIED',
        });
      }
    }
  }

  // Write CSV
  const header = [
    'ticker',
    'fiscalPeriod',
    'metric',
    'oldValue',
    'newValue',
    'percentageDifference',
    'sourceConcept',
    'sourceFiling',
    'transformationApplied',
    'validationStatus',
  ].join(',');

  const csvRows = auditRecords.map(rec => [
    `"${rec.ticker}"`,
    `"${rec.fiscalPeriod}"`,
    `"${rec.metric}"`,
    `"${String(rec.oldValue).replace(/"/g, '""')}"`,
    `"${String(rec.newValue).replace(/"/g, '""')}"`,
    `"${rec.percentageDifference}"`,
    `"${rec.sourceConcept}"`,
    `"${rec.sourceFiling}"`,
    `"${rec.transformationApplied}"`,
    `"${rec.validationStatus}"`,
  ].join(','));

  const csvContent = [header, ...csvRows].join('\n');
  fs.writeFileSync(outCsv, csvContent, 'utf-8');
  console.log(`[ShadowAudit] Audit report CSV written to: ${outCsv} (${auditRecords.length} records).`);

  // Summary Table
  console.log(`\n========================================================================`);
  console.log(`                     SHADOW AUDIT SUMMARY REPORT                        `);
  console.log(`========================================================================`);
  console.log(`Celkový počet skontrolovaných výkazov:       ${rows.length}`);
  console.log(`Konzistentná bilančná rovnováha (A = L + E): ${consistentCount}`);
  console.log(`  - Z toho legitímny záporný kapitál (MCD/PM): ${negativeEquityCount}`);
  console.log(`Nekonzistentné súvahy (|A - (L+E)| > 1%):     ${inconsistentCount} (ZACHOVANÉ, neprepísané)`);
  console.log(`Chýbajúce komponenty súvahy (len navrhnuté): ${missingComponentCount}`);
  console.log(`Záporný Capex (odtoky vyžadujúce konvenciu):  ${negativeCapexCount}`);
  console.log(`ZÁPISY DO PRODUKČNEJ DATABÁZY:               0 (STRIKTNÝ READ-ONLY REŽIM)`);
  console.log(`========================================================================\n`);

  db.close();
}

runShadowAudit();
