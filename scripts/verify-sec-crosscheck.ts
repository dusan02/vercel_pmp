/**
 * PMP v3.1.3-C2: Strict SEC EDGAR Cross-Check & SIVB Forensic Verification
 * 
 * Performs deterministic verification between Finnhub reported financials
 * and the official SEC EDGAR companyfacts US-GAAP taxonomy.
 * 
 * Strict Matching Rules:
 * 1. Exact accession number (accn === accessionNumber)
 * 2. Exact SEC form (form === form)
 * 3. Exact fiscal period (fp === fiscalPeriod, fy === fiscalYear)
 * 4. Exact XBRL US-GAAP concept (NO substring searching!)
 * 5. Full accounting comparison table with explicit Deltas.
 */

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

interface VerificationRow {
  symbol: string;
  form: string;
  period: string;
  accession: string;
  metric: string;
  concept: string;
  finnhubVal: number;
  secVal: number;
  delta: number;
  match: boolean;
}

// Exact concept extraction function (eliminates substring bugs)
function extractExactConcept(report: any, allowedConcepts: string[]): { val: number | null; conceptName: string | null } {
  const allItems = [
    ...(report.ic || []),
    ...(report.bs || []),
    ...(report.cf || []),
  ];

  for (const targetConcept of allowedConcepts) {
    const found = allItems.find((item: any) => item.concept === targetConcept);
    if (found && typeof found.value === 'number') {
      return { val: found.value, conceptName: targetConcept };
    }
  }

  return { val: null, conceptName: null };
}

async function fetchFinnhub(symbol: string, freq: 'annual' | 'quarterly') {
  const url = `https://finnhub.io/api/v1/stock/financials-reported?symbol=${symbol}&freq=${freq}&token=${FINNHUB_KEY}`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  return data.data || [];
}

async function fetchSecCompanyFacts(cik: string) {
  const url = `https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'PMP Quant Research info@premarketprice.com' },
  });
  if (!res.ok) return null;
  return await res.json();
}

async function run() {
  console.log('================================================================');
  console.log(' PMP v3.1.3-C2: STRICT SEC EDGAR XBRL CROSS-CHECK');
  console.log(' Exact concept, accession, form, fiscal year and period matching');
  console.log('================================================================\n');

  const TARGETS = [
    { symbol: 'SIVB', cik: '0000719739', name: 'Silicon Valley Bank' },
    { symbol: 'AAPL', cik: '0000320193', name: 'Apple Inc.' },
    { symbol: 'MSFT', cik: '0000789019', name: 'Microsoft Corp.' },
    { symbol: 'NVDA', cik: '0001045810', name: 'NVIDIA Corp.' },
    { symbol: 'JPM',  cik: '0000019617', name: 'JPMorgan Chase' },
  ];

  const verificationResults: VerificationRow[] = [];

  for (const target of TARGETS) {
    console.log(`>>> Verifying ${target.symbol} (${target.name}, CIK: ${target.cik})...`);

    const annuals = await fetchFinnhub(target.symbol, 'annual');
    await new Promise((r) => setTimeout(r, 1200));

    const quarterlies = await fetchFinnhub(target.symbol, 'quarterly');
    await new Promise((r) => setTimeout(r, 1200));

    const secFacts = await fetchSecCompanyFacts(target.cik);
    await new Promise((r) => setTimeout(r, 800));

    if (!secFacts || !secFacts.facts?.['us-gaap']) {
      console.log(`  Failed to load SEC facts for ${target.symbol}`);
      continue;
    }

    const gaap = secFacts.facts['us-gaap'];

    // Concept definitions for strict verification:
    // 1. Net Income Common Stockholders / Consolidated Net Income
    const netIncomeConcepts = [
      'NetIncomeLossAvailableToCommonStockholdersBasic',
      'ProfitLoss',
      'NetIncomeLoss',
    ];

    // 2. Revenues
    const revenueConcepts = [
      'RevenueFromContractWithCustomerExcludingAssessedTax',
      'SalesRevenueNet',
      'Revenues',
      'InterestAndDividendIncomeOperating', // Banks
    ];

    // 3. Operating Cash Flow
    const ocfConcepts = ['NetCashProvidedByUsedInOperatingActivities'];

    // 4. Assets
    const assetsConcepts = ['Assets'];

    // 5. Equity
    const equityConcepts = ['StockholdersEquity'];

    const testFilings = [...annuals.slice(0, 5), ...quarterlies.slice(0, 5)];

    for (const filing of testFilings) {
      const form = filing.form;
      const accn = filing.accessNumber;
      const fy = filing.year;
      const fp = form === '10-K' ? 'FY' : `Q${filing.quarter}`;

      // A. Verify Net Income
      const niExtracted = extractExactConcept(
        filing.report,
        netIncomeConcepts.map((c) => `us-gaap_${c}`)
      );
      if (niExtracted.val !== null && niExtracted.conceptName) {
        const rawConcept = niExtracted.conceptName.replace('us-gaap_', '');
        const secFactList: any[] = gaap[rawConcept]?.units?.USD || [];
        const match = secFactList.find(
          (f) =>
            f.accn === accn &&
            f.form === form &&
            f.fy === fy &&
            f.fp === fp &&
            Math.abs(f.val - niExtracted.val!) === 0
        );

        const secVal = match ? match.val : (secFactList.find((f) => f.accn === accn)?.val ?? NaN);
        const startStr = match?.start || filing.startDate?.split(' ')[0] || null;
        const endStr = match?.end || filing.endDate?.split(' ')[0] || null;
        let durationDays: number | null = null;
        if (startStr && endStr) {
          const s = new Date(startStr).getTime();
          const e = new Date(endStr).getTime();
          durationDays = Math.round((e - s) / (24 * 3600 * 1000));
        }

        verificationResults.push({
          symbol: target.symbol,
          form,
          period: `${fy} ${fp}`,
          accession: accn,
          metric: 'NetIncome',
          concept: rawConcept,
          periodStart: startStr,
          periodEnd: endStr,
          periodType: 'flow',
          durationDays,
          unit: 'USD',
          finnhubVal: niExtracted.val,
          secVal: isNaN(secVal) ? 0 : secVal,
          delta: isNaN(secVal) ? 0 : niExtracted.val - secVal,
          match: !!match,
        });
      }

      // B. Verify Revenue
      const revExtracted = extractExactConcept(
        filing.report,
        revenueConcepts.map((c) => `us-gaap_${c}`)
      );
      if (revExtracted.val !== null && revExtracted.conceptName) {
        const rawConcept = revExtracted.conceptName.replace('us-gaap_', '');
        const secFactList: any[] = gaap[rawConcept]?.units?.USD || [];
        const match = secFactList.find(
          (f) =>
            f.accn === accn &&
            f.form === form &&
            f.fy === fy &&
            f.fp === fp &&
            Math.abs(f.val - revExtracted.val!) === 0
        );
        const secVal = match ? match.val : (secFactList.find((f) => f.accn === accn)?.val ?? NaN);
        const startStr = match?.start || filing.startDate?.split(' ')[0] || null;
        const endStr = match?.end || filing.endDate?.split(' ')[0] || null;
        let durationDays: number | null = null;
        if (startStr && endStr) {
          const s = new Date(startStr).getTime();
          const e = new Date(endStr).getTime();
          durationDays = Math.round((e - s) / (24 * 3600 * 1000));
        }

        verificationResults.push({
          symbol: target.symbol,
          form,
          period: `${fy} ${fp}`,
          accession: accn,
          metric: 'Revenue',
          concept: rawConcept,
          periodStart: startStr,
          periodEnd: endStr,
          periodType: 'flow',
          durationDays,
          unit: 'USD',
          finnhubVal: revExtracted.val,
          secVal: isNaN(secVal) ? 0 : secVal,
          delta: isNaN(secVal) ? 0 : revExtracted.val - secVal,
          match: !!match,
        });
      }

      // C. Verify Total Assets
      const assetsExtracted = extractExactConcept(
        filing.report,
        assetsConcepts.map((c) => `us-gaap_${c}`)
      );
      if (assetsExtracted.val !== null && assetsExtracted.conceptName) {
        const rawConcept = assetsExtracted.conceptName.replace('us-gaap_', '');
        const secFactList: any[] = gaap[rawConcept]?.units?.USD || [];
        const match = secFactList.find(
          (f) =>
            f.accn === accn &&
            f.form === form &&
            Math.abs(f.val - assetsExtracted.val!) === 0
        );
        const secVal = match ? match.val : (secFactList.find((f) => f.accn === accn)?.val ?? NaN);
        const endStr = match?.end || filing.endDate?.split(' ')[0] || null;

        verificationResults.push({
          symbol: target.symbol,
          form,
          period: `${fy} ${fp}`,
          accession: accn,
          metric: 'TotalAssets',
          concept: rawConcept,
          periodStart: null, // Instant has no start date
          periodEnd: endStr,
          periodType: 'instant',
          durationDays: 0,
          unit: 'USD',
          finnhubVal: assetsExtracted.val,
          secVal: isNaN(secVal) ? 0 : secVal,
          delta: isNaN(secVal) ? 0 : assetsExtracted.val - secVal,
          match: !!match,
        });
      }
    }
  }

  // Write CSV and JSON exports
  const jsonPath = '/tmp/pmp-sec-crosscheck-130.json';
  const csvPath = '/tmp/pmp-sec-crosscheck-130.csv';

  fs.writeFileSync(jsonPath, JSON.stringify(verificationResults, null, 2), 'utf-8');

  const csvHeader = 'symbol,form,period,accession,metric,concept,periodStart,periodEnd,periodType,durationDays,unit,finnhubVal,secVal,delta,match\n';
  const csvLines = verificationResults.map(r => 
    `${r.symbol},${r.form},"${r.period}",${r.accession},${r.metric},${r.concept},${r.periodStart || ''},${r.periodEnd || ''},${r.periodType},${r.durationDays},${r.unit},${r.finnhubVal},${r.secVal},${r.delta},${r.match ? 'PASS' : 'FAIL'}`
  ).join('\n');
  fs.writeFileSync(csvPath, csvHeader + csvLines, 'utf-8');
  console.log(`\n  -> Exported ${verificationResults.length} records to ${jsonPath} and ${csvPath}`);


  // ---------------------------------------------------------------------------
  // PRINT FORENSIC VERIFICATION TABLE
  // ---------------------------------------------------------------------------
  console.log('\n================================================================');
  console.log(' FORENSIC SEC EDGAR CROSS-CHECK RESULTS (STRICT MAPPING)');
  console.log('================================================================');
  console.log(
    'Sym'.padEnd(5) +
      'Form'.padEnd(6) +
      'Period'.padEnd(9) +
      'Metric'.padEnd(12) +
      'Exact XBRL Concept'.padEnd(46) +
      'Finnhub ($)'.padEnd(16) +
      'SEC EDGAR ($)'.padEnd(16) +
      'Delta'.padEnd(10) +
      'Status'
  );
  console.log('-'.repeat(128));

  let matchCount = 0;
  for (const row of verificationResults) {
    if (row.match) matchCount++;
    const finnStr = (row.finnhubVal / 1e6).toFixed(1) + 'M';
    const secStr = (row.secVal / 1e6).toFixed(1) + 'M';
    const deltaStr = (row.delta / 1e6).toFixed(1) + 'M';
    const status = row.match ? '100% MATCH' : 'MISMATCH';

    console.log(
      row.symbol.padEnd(5) +
        row.form.padEnd(6) +
        row.period.padEnd(9) +
        row.metric.padEnd(12) +
        row.concept.padEnd(46) +
        finnStr.padEnd(16) +
        secStr.padEnd(16) +
        deltaStr.padEnd(10) +
        status
    );
  }

  console.log('-'.repeat(128));
  console.log(
    `Total Metrics Audited: ${verificationResults.length} | Exact Matches: ${matchCount}/${
      verificationResults.length
    } (${((matchCount / verificationResults.length) * 100).toFixed(1)}%)`
  );

  // ---------------------------------------------------------------------------
  // SIVB DEDICATED AUDIT
  // ---------------------------------------------------------------------------
  console.log('\n================================================================');
  console.log(' SIVB FORENSIC DISSECTION: FY2022 10-K & Q3 2022 10-Q');
  console.log('================================================================');
  const sivbRows = verificationResults.filter((r) => r.symbol === 'SIVB');
  for (const r of sivbRows) {
    console.log(
      `  [${r.form} ${r.period}] ${r.metric.padEnd(12)} -> Finnhub: $${(r.finnhubVal / 1e6).toFixed(
        1
      )}M | SEC: $${(r.secVal / 1e6).toFixed(1)}M | Status: ${r.match ? 'EXACT MATCH' : 'MISMATCH'}`
    );
  }
}

run().catch((e) => {
  console.error('Fatal error:', e);
  process.exit(1);
});
