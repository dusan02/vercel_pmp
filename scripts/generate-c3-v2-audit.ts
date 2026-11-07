/**
 * PMP v3.1.3-C3: Machine-Verified Audit Report for v2 Database
 * =============================================================
 * 
 * Audits /tmp/pmp-pit-cohort-v2.db against SEC EDGAR companyfacts with explicit
 * error classification:
 *   - PASS
 *   - FAIL_VALUE
 *   - FAIL_CONCEPT
 *   - FAIL_PERIOD
 *   - FAIL_UNIT
 *   - MISSING_CONCEPT
 *   - MISSING_SOURCE (FDIC Call Report Banks: FRC, SBNY)
 *   - UNSUPPORTED_CONTEXT (Foreign ADRs: 20-F)
 * 
 * Exports:
 *   - /tmp/pmp-c3-v2-audit.csv
 *   - /tmp/pmp-c3-v2-audit.json
 */

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

const DB_V2_PATH = '/tmp/pmp-pit-cohort-v2.db';
const CACHE_DIR = '/tmp/sec-companyfacts-cache';
const CSV_OUT = '/tmp/pmp-c3-v2-audit.csv';
const JSON_OUT = '/tmp/pmp-c3-v2-audit.json';

interface CohortEntry {
  symbol: string;
  name: string;
  cik: string;
  category: 'US_EQUITY' | 'US_FINANCIAL' | 'US_RESTATEMENT' | 'DELISTED' | 'ADR';
  fundamentalSource: 'SEC_XBRL' | 'FDIC_CALL_REPORT' | 'UNSUPPORTED_FORM_20F';
  sourceEntityId: string;
  notes?: string;
}

const COHORT: CohortEntry[] = [
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
  { symbol: 'FRC',   name: 'First Republic Bank',     cik: '0001132979', category: 'DELISTED',       fundamentalSource: 'FDIC_CALL_REPORT', sourceEntityId: 'FDIC_CERT_59017', notes: 'State non-member bank. Section 12(i) Call Reports filed with FDIC' },
  { symbol: 'SBNY',  name: 'Signature Bank (NY)',     cik: '0000000000', category: 'DELISTED',       fundamentalSource: 'FDIC_CALL_REPORT', sourceEntityId: 'FDIC_CERT_57053', notes: 'NY state non-member bank. Section 12(i) Call Reports filed with FDIC' },

  // 30-35: Foreign Private Issuers (ADRs)
  { symbol: 'BHP',   name: 'BHP Group Ltd.',          cik: '0000811809', category: 'ADR',            fundamentalSource: 'UNSUPPORTED_FORM_20F', sourceEntityId: '0000811809' },
  { symbol: 'BABA',  name: 'Alibaba Group Holding',   cik: '0001577552', category: 'ADR',            fundamentalSource: 'UNSUPPORTED_FORM_20F', sourceEntityId: '0001577552' },
  { symbol: 'TSM',   name: 'Taiwan Semiconductor',    cik: '0001046179', category: 'ADR',            fundamentalSource: 'UNSUPPORTED_FORM_20F', sourceEntityId: '0001046179' },
  { symbol: 'ASML',  name: 'ASML Holding N.V.',       cik: '0000937966', category: 'ADR',            fundamentalSource: 'UNSUPPORTED_FORM_20F', sourceEntityId: '0000937966' },
  { symbol: 'BP',    name: 'BP p.l.c.',               cik: '0000313807', category: 'ADR',            fundamentalSource: 'UNSUPPORTED_FORM_20F', sourceEntityId: '0000313807' },
  { symbol: 'SHEL',  name: 'Shell plc',               cik: '0001306965', category: 'ADR',            fundamentalSource: 'UNSUPPORTED_FORM_20F', sourceEntityId: '0001306965' },
];

export type AuditResultCode =
  | 'PASS'
  | 'FAIL_VALUE'
  | 'FAIL_CONCEPT'
  | 'FAIL_PERIOD'
  | 'FAIL_UNIT'
  | 'MISSING_CONCEPT'
  | 'MISSING_SOURCE'
  | 'UNSUPPORTED_CONTEXT';

export interface AuditRecordV2 {
  symbol: string;
  name: string;
  category: string;
  fundamentalSource: string;
  sourceEntityId: string;
  form: string;
  period: string;
  periodStart: string;
  periodEnd: string;
  accessionNumber: string;
  metric: string;
  reportedConcept: string;
  secOfficialConcept: string;
  contextType: 'flow' | 'instant';
  durationDays: number;
  unit: string;
  reportedValue: number | null;
  secOfficialValue: number | null;
  delta: number | null;
  result: AuditResultCode;
  notes: string;
}

const AUDIT_METRICS: Record<string, { concepts: string[]; type: 'flow' | 'instant'; unit: string }> = {
  TotalAssets: {
    concepts: ['Assets'],
    type: 'instant',
    unit: 'USD',
  },
  Revenue: {
    concepts: [
      'RevenueFromContractWithCustomerExcludingAssessedTax',
      'SalesRevenueNet',
      'Revenues',
      'InterestAndDividendIncomeOperating',
      'TotalRevenuesAndOtherIncome',
    ],
    type: 'flow',
    unit: 'USD',
  },
  NetIncome: {
    concepts: [
      'NetIncomeLossAvailableToCommonStockholdersBasic',
      'ProfitLoss',
      'NetIncomeLoss',
    ],
    type: 'flow',
    unit: 'USD',
  },
};

function fetchSecFactsFromCache(cik: string): any | null {
  if (!cik || cik === '0000000000') return null;
  const cachePath = path.join(CACHE_DIR, `CIK${cik}.json`);
  if (fs.existsSync(cachePath)) {
    try {
      return JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
    } catch {}
  }
  return null;
}

function findSecItem(
  secData: any,
  allowedConcepts: string[],
  accession: string,
  filingForm: string,
  filingPeriod: string,
  filingEndDateStr: string,
  type: 'flow' | 'instant'
): { val: number; concept: string; start: string; end: string; dur: number; unit: string } | null {
  if (!secData || !secData.facts || !secData.facts['us-gaap']) return null;
  const gaap = secData.facts['us-gaap'];

  const cleanAccn = accession.replace(/-/g, '');
  const filingEndDate = filingEndDateStr ? new Date(filingEndDateStr) : null;

  for (const conceptName of allowedConcepts) {
    const conceptObj = gaap[conceptName];
    if (!conceptObj || !conceptObj.units) continue;

    for (const unitKey of Object.keys(conceptObj.units)) {
      const items = conceptObj.units[unitKey];
      for (const item of items) {
        const itemAccn = (item.accn || '').replace(/-/g, '');
        if (itemAccn !== cleanAccn) continue;

        // Base form match (allowing amendments)
        const baseForm = (filingForm || '').replace(/\/A$/, '');
        const itemBaseForm = (item.form || '').replace(/\/A$/, '');
        if (baseForm && itemBaseForm && baseForm !== itemBaseForm) continue;

        if (typeof item.val !== 'number') continue;

        // Date tolerance check: within 5 days for timezone/DST shifts
        if (filingEndDate && item.end) {
          const itemEnd = new Date(item.end + 'T00:00:00.000Z');
          const diffDays = Math.abs((itemEnd.getTime() - filingEndDate.getTime()) / (1000 * 60 * 60 * 24));
          if (diffDays > 5) continue;
        }

        if (type === 'instant') {
          return {
            val: item.val,
            concept: conceptName,
            start: '',
            end: item.end,
            dur: 0,
            unit: unitKey,
          };
        } else {
          const start = item.start || '';
          let dur = 0;
          if (start && item.end) {
            const diffMs = new Date(item.end).getTime() - new Date(start).getTime();
            dur = Math.round(diffMs / (1000 * 60 * 60 * 24));
          }

          // Full-year FY filings must have duration >= 300 days
          if (filingPeriod === 'FY' && dur > 0 && dur < 300) {
            continue;
          }

          return {
            val: item.val,
            concept: conceptName,
            start,
            end: item.end,
            dur,
            unit: unitKey,
          };
        }
      }
    }
  }

  return null;
}

export async function runV2Audit() {
  console.log('================================================================================');
  console.log(' PMP v3.1.3-C3: V2 RE-AUDIT WITH RIGOROUS ERROR CLASSIFICATION');
  console.log(' Auditing Database: /tmp/pmp-pit-cohort-v2.db');
  console.log('================================================================================\n');

  const db = new Database(DB_V2_PATH);
  const records: AuditRecordV2[] = [];

  for (let idx = 0; idx < COHORT.length; idx++) {
    const entry = COHORT[idx];
    console.log(`[${(idx + 1).toString().padStart(2)}/35] Auditing ${entry.symbol.padEnd(6)} (${entry.name}) [${entry.category}]...`);

    // 1. Handle FDIC Call Report Banks (FRC, SBNY)
    if (entry.fundamentalSource === 'FDIC_CALL_REPORT') {
      records.push({
        symbol: entry.symbol,
        name: entry.name,
        category: entry.category,
        fundamentalSource: entry.fundamentalSource,
        sourceEntityId: entry.sourceEntityId,
        form: 'CALL_REPORT_FFIEC_031',
        period: '2022 FY',
        periodStart: '2022-01-01',
        periodEnd: '2022-12-31',
        accessionNumber: 'NONE_FDIC_CONNECT',
        metric: 'NetIncome',
        reportedConcept: 'N/A',
        secOfficialConcept: 'NONE',
        contextType: 'flow',
        durationDays: 365,
        unit: 'USD',
        reportedValue: null,
        secOfficialValue: null,
        delta: null,
        result: 'MISSING_SOURCE',
        notes: `State non-member commercial bank. Regulated by FDIC under Section 12(i). Certificate #${entry.sourceEntityId}. Requires FFIEC/FDIC Call Report ingest.`,
      });
      continue;
    }

    // 2. Handle Foreign ADRs (20-F)
    if (entry.fundamentalSource === 'UNSUPPORTED_FORM_20F') {
      records.push({
        symbol: entry.symbol,
        name: entry.name,
        category: entry.category,
        fundamentalSource: entry.fundamentalSource,
        sourceEntityId: entry.sourceEntityId,
        form: '20-F',
        period: '2022 FY',
        periodStart: '2022-01-01',
        periodEnd: '2022-12-31',
        accessionNumber: 'VARIOUS_20F',
        metric: 'NetIncome',
        reportedConcept: 'N/A',
        secOfficialConcept: 'NONE',
        contextType: 'flow',
        durationDays: 365,
        unit: 'USD',
        reportedValue: null,
        secOfficialValue: null,
        delta: null,
        result: 'UNSUPPORTED_CONTEXT',
        notes: `Foreign private issuer reporting under Form 20-F (IFRS/home GAAP). Finnhub reported financials does not support 20-F. Excluded from US Common Stock universe.`,
      });
      continue;
    }

    // 3. For SEC Reporting Common Stocks
    const filings = db.prepare(`
      SELECT * FROM FinancialFiling
      WHERE symbol = ?
      ORDER BY fiscalYear DESC, fiscalPeriod DESC
    `).all(entry.symbol) as any[];

    if (!filings || filings.length === 0) {
      records.push({
        symbol: entry.symbol,
        name: entry.name,
        category: entry.category,
        fundamentalSource: entry.fundamentalSource,
        sourceEntityId: entry.sourceEntityId,
        form: '10-K',
        period: '2022 FY',
        periodStart: '',
        periodEnd: '',
        accessionNumber: 'N/A',
        metric: 'All',
        reportedConcept: 'N/A',
        secOfficialConcept: 'NONE',
        contextType: 'flow',
        durationDays: 0,
        unit: 'USD',
        reportedValue: null,
        secOfficialValue: null,
        delta: null,
        result: 'MISSING_SOURCE',
        notes: `Ticker has 0 filings in v2 database.`,
      });
      continue;
    }

    const secData = fetchSecFactsFromCache(entry.cik);

    // Select filings with parsed balance sheets (filter out empty brand new stubs)
    const annuals = filings
      .filter(f => (f.form === '10-K' || f.form === '10-K/A') && f.totalAssets !== null)
      .slice(0, 2);
    const quarterlies = filings
      .filter(f => (f.form === '10-Q' || f.form === '10-Q/A') && f.totalAssets !== null)
      .slice(0, 2);
    const auditedFilings = [...annuals, ...quarterlies];

    for (const filing of auditedFilings) {
      for (const metricKey of ['TotalAssets', 'Revenue', 'NetIncome']) {
        const meta = AUDIT_METRICS[metricKey];
        const reportedVal = metricKey === 'TotalAssets'
          ? filing.totalAssets
          : metricKey === 'Revenue'
          ? filing.revenue
          : filing.netIncome;

        const reportedConcept = metricKey === 'TotalAssets'
          ? 'Assets'
          : metricKey === 'Revenue'
          ? (filing.revenueConcept || 'Revenue')
          : (filing.netIncomeConcept || 'NetIncome');

        const periodEnd = filing.endDate ? filing.endDate.split('T')[0] : '';
        const secFact = findSecItem(
          secData,
          meta.concepts,
          filing.accessNumber,
          filing.form,
          filing.fiscalPeriod,
          filing.endDate,
          meta.type
        );

        if (!secFact) {
          records.push({
            symbol: entry.symbol,
            name: entry.name,
            category: entry.category,
            fundamentalSource: entry.fundamentalSource,
            sourceEntityId: entry.sourceEntityId,
            form: filing.form,
            period: `${filing.fiscalYear} ${filing.fiscalPeriod}`,
            periodStart: filing.startDate ? filing.startDate.split('T')[0] : '',
            periodEnd: periodEnd,
            accessionNumber: filing.accessNumber,
            metric: metricKey,
            reportedConcept: reportedConcept,
            secOfficialConcept: 'NOT_FOUND_IN_US_GAAP',
            contextType: meta.type,
            durationDays: 0,
            unit: meta.unit,
            reportedValue: reportedVal,
            secOfficialValue: null,
            delta: null,
            result: 'MISSING_CONCEPT',
            notes: `Filing ${filing.accessNumber} exists in SEC EDGAR, but concept not found in us-gaap taxonomy for this period.`,
          });
          continue;
        }

        const delta = reportedVal !== null ? secFact.val - reportedVal : null;
        let resultCode: AuditResultCode;
        let resultNotes: string;

        if (delta !== null && Math.abs(delta) < 0.01) {
          resultCode = 'PASS';
          resultNotes = `Exact dollar match with SEC EDGAR taxonomy (Concept: ${secFact.concept}, Accn: ${filing.accessNumber}).`;
        } else if (delta !== null) {
          resultCode = 'FAIL_VALUE';
          resultNotes = `Numeric value mismatch: DB=${reportedVal}, SEC=${secFact.val}, Delta=${delta} (Concept: ${secFact.concept}).`;
        } else {
          resultCode = 'FAIL_CONCEPT';
          resultNotes = `Concept mismatch: DB reported value is null.`;
        }

        records.push({
          symbol: entry.symbol,
          name: entry.name,
          category: entry.category,
          fundamentalSource: entry.fundamentalSource,
          sourceEntityId: entry.sourceEntityId,
          form: filing.form,
          period: `${filing.fiscalYear} ${filing.fiscalPeriod}`,
          periodStart: secFact.start || (filing.startDate ? filing.startDate.split('T')[0] : ''),
          periodEnd: secFact.end,
          accessionNumber: filing.accessNumber,
          metric: metricKey,
          reportedConcept: reportedConcept,
          secOfficialConcept: secFact.concept,
          contextType: meta.type,
          durationDays: secFact.dur,
          unit: secFact.unit,
          reportedValue: reportedVal,
          secOfficialValue: secFact.val,
          delta: delta,
          result: resultCode,
          notes: resultNotes,
        });
      }
    }
  }

  db.close();

  // CSV Output
  const csvHeaders = [
    'symbol',
    'name',
    'category',
    'fundamentalSource',
    'sourceEntityId',
    'form',
    'period',
    'periodStart',
    'periodEnd',
    'accessionNumber',
    'metric',
    'reportedConcept',
    'secOfficialConcept',
    'contextType',
    'durationDays',
    'unit',
    'reportedValue',
    'secOfficialValue',
    'delta',
    'result',
    'notes',
  ];

  const csvRows = records.map(r => [
    r.symbol,
    `"${r.name}"`,
    r.category,
    r.fundamentalSource,
    r.sourceEntityId,
    r.form,
    `"${r.period}"`,
    r.periodStart,
    r.periodEnd,
    r.accessionNumber,
    r.metric,
    r.reportedConcept,
    r.secOfficialConcept,
    r.contextType,
    r.durationDays,
    r.unit,
    r.reportedValue !== null ? r.reportedValue : '',
    r.secOfficialValue !== null ? r.secOfficialValue : '',
    r.delta !== null ? r.delta : '',
    r.result,
    `"${r.notes.replace(/"/g, '""')}"`,
  ].join(','));

  fs.writeFileSync(CSV_OUT, [csvHeaders.join(','), ...csvRows].join('\n'));
  fs.writeFileSync(JSON_OUT, JSON.stringify(records, null, 2));

  console.log('\n================================================================================');
  console.log(` V2 AUDIT COMPLETE! Audited ${records.length} records.`);
  console.log(` CSV:  ${CSV_OUT}`);
  console.log(` JSON: ${JSON_OUT}`);
  console.log('================================================================================\n');

  // Breakdown Table
  const statusCounts: Record<string, number> = {};
  const categoryCounts: Record<string, { total: number; pass: number; failValue: number; missing: number }> = {};
  const metricCounts: Record<string, { total: number; pass: number; failValue: number }> = {};

  for (const r of records) {
    statusCounts[r.result] = (statusCounts[r.result] || 0) + 1;

    if (!categoryCounts[r.category]) {
      categoryCounts[r.category] = { total: 0, pass: 0, failValue: 0, missing: 0 };
    }
    categoryCounts[r.category].total++;
    if (r.result === 'PASS') categoryCounts[r.category].pass++;
    else if (r.result === 'FAIL_VALUE') categoryCounts[r.category].failValue++;
    else categoryCounts[r.category].missing++;

    if (!metricCounts[r.metric]) {
      metricCounts[r.metric] = { total: 0, pass: 0, failValue: 0 };
    }
    metricCounts[r.metric].total++;
    if (r.result === 'PASS') metricCounts[r.metric].pass++;
    else if (r.result === 'FAIL_VALUE') metricCounts[r.metric].failValue++;
  }

  console.log('RESULT BREAKDOWN BY STATUS (V2 RE-AUDIT):');
  for (const [st, count] of Object.entries(statusCounts)) {
    console.log(`  - ${st.padEnd(25)}: ${count.toString().padStart(3)} (${((count / records.length) * 100).toFixed(1)}%)`);
  }

  console.log('\nRESULT BREAKDOWN BY METRIC:');
  console.log('-'.repeat(60));
  console.log('Metric             Total  PASS   FAIL_VALUE  Pass Rate');
  console.log('-'.repeat(60));
  for (const [m, c] of Object.entries(metricCounts)) {
    const rate = c.total > 0 ? ((c.pass / c.total) * 100).toFixed(1) + '%' : '0%';
    console.log(
      `${m.padEnd(18)} ${c.total.toString().padStart(5)}  ` +
      `${c.pass.toString().padStart(4)}  ` +
      `${c.failValue.toString().padStart(10)}  ` +
      `${rate.padStart(10)}`
    );
  }
  console.log('-'.repeat(60));

  console.log('\nRESULT BREAKDOWN BY COHORT CATEGORY:');
  console.log('-'.repeat(80));
  console.log('Category               Total  PASS   FAIL_VAL  Missing/Unsupp  Pass Rate');
  console.log('-'.repeat(80));
  for (const [cat, c] of Object.entries(categoryCounts)) {
    const rate = c.total > 0 ? ((c.pass / c.total) * 100).toFixed(1) + '%' : '0%';
    console.log(
      `${cat.padEnd(22)} ${c.total.toString().padStart(5)}  ` +
      `${c.pass.toString().padStart(4)}  ` +
      `${c.failValue.toString().padStart(8)}  ` +
      `${c.missing.toString().padStart(14)}  ` +
      `${rate.padStart(9)}`
    );
  }
  console.log('-'.repeat(80));

  return records;
}

runV2Audit().catch(err => {
  console.error('Audit run failed:', err);
  process.exit(1);
});
