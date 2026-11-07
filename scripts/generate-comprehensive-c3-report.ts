/**
 * PMP v3.1.3-C3: Comprehensive Forensic Audit & Validation Report Generator
 * =========================================================================
 * 
 * Generates machine-verifiable CSV and JSON audit package for all 35 companies:
 * - 23 Active US Common Stocks (Tech, Industrial, Retail, Financials, Restatements)
 * - 6 Delisted / Bankrupt / Acquired (SIVB, TWTR, ATVI, BBBY, FRC, SBNY)
 * - 6 Foreign ADRs (BHP, BABA, TSM, ASML, BP, SHEL)
 * 
 * Verifies every fact against SEC EDGAR companyfacts or documents regulatory
 * reason for non-SEC reporting (e.g. FDIC Call Reports for FRC/SBNY, Form 20-F for ADRs).
 * 
 * Output:
 *   - /tmp/pmp-c3-comprehensive-audit.csv
 *   - /tmp/pmp-c3-comprehensive-audit.json
 */

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

const DB_PATH = '/tmp/pmp-pit-cohort.db';
const CACHE_DIR = '/tmp/sec-companyfacts-cache';
const CSV_OUT = '/tmp/pmp-c3-comprehensive-audit.csv';
const JSON_OUT = '/tmp/pmp-c3-comprehensive-audit.json';

interface CohortEntry {
  symbol: string;
  name: string;
  cik: string;
  category: 'US_EQUITY' | 'US_FINANCIAL' | 'US_RESTATEMENT' | 'DELISTED' | 'ADR';
  fundamentalSource: 'SEC_XBRL' | 'FDIC_CALL_REPORT' | 'UNSUPPORTED_FORM_20F';
  sourceEntityId: string; // CIK or FDIC Cert
  notes?: string;
}

const COHORT: CohortEntry[] = [
  // 1-13: Core US Common Stocks
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

  // 22-23: US Large Financials / Banks
  { symbol: 'JPM',   name: 'JPMorgan Chase & Co.',    cik: '0000019617', category: 'US_FINANCIAL',   fundamentalSource: 'SEC_XBRL', sourceEntityId: '0000019617' },
  { symbol: 'BAC',   name: 'Bank of America Corp.',   cik: '0000070858', category: 'US_FINANCIAL',   fundamentalSource: 'SEC_XBRL', sourceEntityId: '0000070858' },

  // 24-29: Delisted / Bankrupt / FDIC Receivership
  { symbol: 'SIVB',  name: 'Silicon Valley Bank',     cik: '0000719739', category: 'DELISTED',       fundamentalSource: 'SEC_XBRL',         sourceEntityId: '0000719739', notes: 'SEC reporting bank holding company, collapsed March 2023' },
  { symbol: 'TWTR',  name: 'Twitter Inc.',            cik: '0001418091', category: 'DELISTED',       fundamentalSource: 'SEC_XBRL',         sourceEntityId: '0001418091', notes: 'Acquired by X Corp Oct 2022' },
  { symbol: 'ATVI',  name: 'Activision Blizzard',     cik: '0000718877', category: 'DELISTED',       fundamentalSource: 'SEC_XBRL',         sourceEntityId: '0000718877', notes: 'Acquired by MSFT Oct 2023' },
  { symbol: 'BBBY',  name: 'Bed Bath & Beyond',       cik: '0000886158', category: 'DELISTED',       fundamentalSource: 'SEC_XBRL',         sourceEntityId: '0000886158', notes: 'Bankrupt April 2023' },
  { symbol: 'FRC',   name: 'First Republic Bank',     cik: '0001132979', category: 'DELISTED',       fundamentalSource: 'FDIC_CALL_REPORT', sourceEntityId: 'FDIC_CERT_59017', notes: 'State non-member bank; Section 12(i) periodic reports filed with FDIC' },
  { symbol: 'SBNY',  name: 'Signature Bank (NY)',     cik: '0000000000', category: 'DELISTED',       fundamentalSource: 'FDIC_CALL_REPORT', sourceEntityId: 'FDIC_CERT_57053', notes: 'NY state non-member bank; Section 12(i) reports filed with FDIC' },

  // 30-35: Foreign Private Issuers (ADRs)
  { symbol: 'BHP',   name: 'BHP Group Ltd.',          cik: '0000811809', category: 'ADR',            fundamentalSource: 'UNSUPPORTED_FORM_20F', sourceEntityId: '0000811809', notes: 'Australian filer; Form 20-F semi-annual GAAP' },
  { symbol: 'BABA',  name: 'Alibaba Group Holding',   cik: '0001577552', category: 'ADR',            fundamentalSource: 'UNSUPPORTED_FORM_20F', sourceEntityId: '0001577552', notes: 'Cayman/China filer; Form 20-F annual GAAP' },
  { symbol: 'TSM',   name: 'Taiwan Semiconductor',    cik: '0001046179', category: 'ADR',            fundamentalSource: 'UNSUPPORTED_FORM_20F', sourceEntityId: '0001046179', notes: 'Taiwanese filer; Form 20-F IFRS' },
  { symbol: 'ASML',  name: 'ASML Holding N.V.',       cik: '0000937966', category: 'ADR',            fundamentalSource: 'UNSUPPORTED_FORM_20F', sourceEntityId: '0000937966', notes: 'Dutch filer; Form 20-F Dutch/US GAAP' },
  { symbol: 'BP',    name: 'BP p.l.c.',               cik: '0000313807', category: 'ADR',            fundamentalSource: 'UNSUPPORTED_FORM_20F', sourceEntityId: '0000313807', notes: 'UK filer; Form 20-F IFRS' },
  { symbol: 'SHEL',  name: 'Shell plc',               cik: '0001306965', category: 'ADR',            fundamentalSource: 'UNSUPPORTED_FORM_20F', sourceEntityId: '0001306965', notes: 'UK filer; Form 20-F IFRS' },
];

export interface AuditRecord {
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
  xbrlConcept: string;
  contextType: 'flow' | 'instant';
  durationDays: number;
  unit: string;
  reportedValue: number | null;
  secOfficialValue: number | null;
  delta: number | null;
  result: 'PASS' | 'FAIL_NOMINAL_MISMATCH' | 'MISSING_SEC_DATA' | 'UNSUPPORTED_FORM_20F' | 'MISSING_CONCEPT_IN_SEC' | 'MISSING_IN_LOCAL_DB';
  notes: string;
}

// SEC concepts mapping
const METRIC_CONCEPTS: Record<string, { concepts: string[]; type: 'flow' | 'instant'; unit: string }> = {
  NetIncome: {
    concepts: [
      'NetIncomeLossAvailableToCommonStockholdersBasic',
      'ProfitLoss',
      'NetIncomeLoss',
    ],
    type: 'flow',
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
  TotalAssets: {
    concepts: ['Assets'],
    type: 'instant',
    unit: 'USD',
  },
};

async function fetchOrGetSecFacts(cik: string): Promise<any | null> {
  if (!cik || cik === '0000000000') return null;
  const cachePath = path.join(CACHE_DIR, `CIK${cik}.json`);
  if (fs.existsSync(cachePath)) {
    try {
      return JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
    } catch {}
  }

  const url = `https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'PMP Quant Research research@premarketprice.com' },
    });
    if (!res.ok) return null;
    const data = await res.json();
    fs.writeFileSync(cachePath, JSON.stringify(data));
    return data;
  } catch {
    return null;
  }
}

function findSecFact(
  secData: any,
  concepts: string[],
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

  for (const conceptName of concepts) {
    const conceptObj = gaap[conceptName];
    if (!conceptObj || !conceptObj.units) continue;

    for (const unitKey of Object.keys(conceptObj.units)) {
      const items = conceptObj.units[unitKey];
      for (const item of items) {
        const itemAccn = (item.accn || '').replace(/-/g, '');
        if (itemAccn !== cleanAccn) continue;

        // Form check (tolerant to /A)
        const baseForm = (filingForm || '').replace(/\/A$/, '');
        const itemBaseForm = (item.form || '').replace(/\/A$/, '');
        if (baseForm && itemBaseForm && baseForm !== itemBaseForm) continue;

        if (typeof item.val !== 'number') continue;

        // Date tolerance check (within 5 days to account for UTC/EST conversions)
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
          // Flow: calculate duration
          const start = item.start || '';
          let dur = 0;
          if (start && item.end) {
            const diffMs = new Date(item.end).getTime() - new Date(start).getTime();
            dur = Math.round(diffMs / (1000 * 60 * 60 * 24));
          }

          // For FY annual 10-K, ensure full year (~350+ days), avoid short stub/quarterly facts in 10-K
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

export async function runComprehensiveAudit(): Promise<AuditRecord[]> {
  console.log('================================================================================');
  console.log(' PMP v3.1.3-C3: COMPREHENSIVE FORENSIC AUDIT & VERIFICATION REPORT');
  console.log(' Full transparency across 35 Cohort Tickers (Passes, Fails, Missings, FDIC, ADR)');
  console.log('================================================================================\n');

  const db = new Database(DB_PATH);
  const records: AuditRecord[] = [];

  for (let idx = 0; idx < COHORT.length; idx++) {
    const entry = COHORT[idx];
    console.log(`[${idx + 1}/35] Processing ${entry.symbol} (${entry.name}) [${entry.category}]...`);

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
        xbrlConcept: 'FDIC_Schedule_RI_NetIncome',
        contextType: 'flow',
        durationDays: 365,
        unit: 'USD',
        reportedValue: null,
        secOfficialValue: null,
        delta: null,
        result: 'MISSING_SEC_DATA',
        notes: `State non-member bank. Section 12(i) periodic reports filed with FDIC, not SEC EDGAR. Certificate #${entry.sourceEntityId}`,
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
        xbrlConcept: 'Foreign_IFRS_20F',
        contextType: 'flow',
        durationDays: 365,
        unit: 'USD',
        reportedValue: null,
        secOfficialValue: null,
        delta: null,
        result: 'UNSUPPORTED_FORM_20F',
        notes: `Foreign private issuer. Finnhub reported-financials does not support Form 20-F filings. Excluded from US Common Stock universe.`,
      });
      continue;
    }

    // 3. For SEC Reporting Common Stocks
    // Query local DB for filings
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
        xbrlConcept: 'N/A',
        contextType: 'flow',
        durationDays: 0,
        unit: 'USD',
        reportedValue: null,
        secOfficialValue: null,
        delta: null,
        result: 'MISSING_IN_LOCAL_DB',
        notes: `Ticker not ingested into local test cohort database.`,
      });
      continue;
    }

    // Fetch SEC EDGAR companyfacts
    const secData = await fetchOrGetSecFacts(entry.cik);
    // Rate limit polite delay
    await new Promise(r => setTimeout(r, 200));

    // Select key filings to audit: 2 recent 10-K and 2 recent 10-Q
    const annuals = filings.filter(f => f.form === '10-K' || f.form === '10-K/A').slice(0, 2);
    const quarterlies = filings.filter(f => f.form === '10-Q' || f.form === '10-Q/A').slice(0, 2);
    const auditedFilings = [...annuals, ...quarterlies];

    for (const filing of auditedFilings) {
      for (const metricKey of ['NetIncome', 'Revenue', 'TotalAssets']) {
        const meta = METRIC_CONCEPTS[metricKey];
        const reportedVal = metricKey === 'NetIncome' 
          ? filing.netIncome 
          : metricKey === 'Revenue' 
          ? filing.revenue 
          : filing.totalAssets;

        const periodEnd = filing.endDate ? filing.endDate.split('T')[0] : '';
        const secFact = findSecFact(
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
            xbrlConcept: 'NONE_FOUND_IN_GAAP',
            contextType: meta.type,
            durationDays: 0,
            unit: meta.unit,
            reportedValue: reportedVal,
            secOfficialValue: null,
            delta: null,
            result: 'MISSING_CONCEPT_IN_SEC',
            notes: `Filing ${filing.accessNumber} exists in SEC, but target concepts not found in us-gaap taxonomy under accession.`,
          });
          continue;
        }

        const delta = reportedVal !== null ? secFact.val - reportedVal : null;
        const isMatch = delta !== null && Math.abs(delta) < 0.01;

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
          xbrlConcept: secFact.concept,
          contextType: meta.type,
          durationDays: secFact.dur,
          unit: secFact.unit,
          reportedValue: reportedVal,
          secOfficialValue: secFact.val,
          delta: delta,
          result: isMatch ? 'PASS' : 'FAIL_NOMINAL_MISMATCH',
          notes: isMatch 
            ? `Exact match with SEC EDGAR facts (Accession ${filing.accessNumber})`
            : `Mismatch: DB=${reportedVal}, SEC=${secFact.val}, Delta=${delta}`,
        });
      }
    }
  }

  db.close();

  // Export CSV
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
    'xbrlConcept',
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
    r.xbrlConcept,
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
  console.log(` AUDIT COMPLETE! Exported ${records.length} records.`);
  console.log(` CSV:  ${CSV_OUT}`);
  console.log(` JSON: ${JSON_OUT}`);
  console.log('================================================================================\n');

  // Breakdown Table
  const statusCounts: Record<string, number> = {};
  const categoryCounts: Record<string, { total: number; pass: number; fail: number; other: number }> = {};

  for (const r of records) {
    statusCounts[r.result] = (statusCounts[r.result] || 0) + 1;

    if (!categoryCounts[r.category]) {
      categoryCounts[r.category] = { total: 0, pass: 0, fail: 0, other: 0 };
    }
    categoryCounts[r.category].total++;
    if (r.result === 'PASS') categoryCounts[r.category].pass++;
    else if (r.result === 'FAIL_NOMINAL_MISMATCH') categoryCounts[r.category].fail++;
    else categoryCounts[r.category].other++;
  }

  console.log('RESULT BREAKDOWN BY STATUS:');
  for (const [st, count] of Object.entries(statusCounts)) {
    console.log(`  - ${st.padEnd(25)}: ${count.toString().padStart(3)} (${((count / records.length) * 100).toFixed(1)}%)`);
  }

  console.log('\nRESULT BREAKDOWN BY COHORT CATEGORY:');
  console.log('-'.repeat(80));
  console.log('Category               Total  PASS   FAIL   Missing/Unsupported  Pass Rate');
  console.log('-'.repeat(80));
  for (const [cat, c] of Object.entries(categoryCounts)) {
    const rate = c.total > 0 ? ((c.pass / c.total) * 100).toFixed(1) + '%' : '0%';
    console.log(
      `${cat.padEnd(22)} ${c.total.toString().padStart(5)}  ` +
      `${c.pass.toString().padStart(4)}  ` +
      `${c.fail.toString().padStart(4)}  ` +
      `${c.other.toString().padStart(19)}  ` +
      `${rate.padStart(8)}`
    );
  }
  console.log('-'.repeat(80));

  return records;
}

// Execute
runComprehensiveAudit().catch(err => {
  console.error('Audit execution failed:', err);
  process.exit(1);
});
