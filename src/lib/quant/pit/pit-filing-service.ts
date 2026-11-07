/**
 * PMP Point-in-Time Financial Filing Service (PMP v3.1.3-A2)
 * 
 * Implements strict Point-in-Time (PIT) evaluation of SEC filings:
 * 1. Filtering by availableAt <= asOf (Zero look-ahead bias).
 * 2. Explicit chronological sorting by acceptedDate / availableAt.
 * 3. Support for amendments (10-K/A, 10-Q/A) without overwriting original historical filings.
 * 4. Clear separation of accounting period (fiscalYear, fiscalPeriod) from filing event timestamps.
 */

export interface FinancialFilingRecord {
  id: string;
  symbol: string;
  accessNumber: string | null;
  cik: string | null;
  form: string;
  isAmendment: boolean;
  fiscalYear: number;
  fiscalPeriod: string; // "FY", "Q1", "Q2", "Q3", "Q4", "H1", "H2"
  period: string;       // e.g. "2024FY", "2024Q3"
  startDate: Date | null;
  endDate: Date;        // Period end date (economic period)
  filedDate: Date | null;
  acceptedDate: Date;   // SEC EDGAR acceptance timestamp in UTC
  availableAt: Date;    // Public availability instant in UTC
  rawAcceptedStr: string | null;
  rawTimezone: string | null;
  source: string | null;
  statementId?: string | null;

  // Financial metrics disclosed in this specific filing
  revenue: number | null;
  netIncome: number | null;
  ebit: number | null;
  grossProfit: number | null;
  operatingCashFlow: number | null;
  capex: number | null;
  totalAssets: number | null;
  totalLiabilities: number | null;
  currentAssets: number | null;
  currentLiabilities: number | null;
  totalEquity: number | null;
  sharesOutstanding: number | null;
  cashAndEquivalents: number | null;
  totalDebt: number | null;
}

export interface PitFilingQueryOptions {
  symbol: string;
  asOf: Date; // UTC instant
  formType?: '10-K' | '10-Q' | 'ALL_PERIODIC' | string;
  periodType?: 'ANNUAL' | 'QUARTERLY' | 'ANY';
  targetFiscalPeriod?: {
    fiscalYear: number;
    fiscalPeriod: string;
  };
}

/**
 * Returns the latest valid Financial Filing for a company known at a specific point in time (asOf).
 * 
 * Rules:
 * - availableAt MUST be <= asOf (Strict PIT boundary).
 * - If multiple filings exist for the same period (e.g. 10-Q and 10-Q/A):
 *   - The amendment is selected ONLY IF amendment.availableAt <= asOf.
 *   - If the amendment was filed AFTER asOf, the original filing is returned.
 * - Sorts chronologically by endDate DESC, then acceptedDate DESC.
 */
export function getPointInTimeFinancialFiling(
  filings: FinancialFilingRecord[],
  options: PitFilingQueryOptions
): FinancialFilingRecord | null {
  const asOfMs = options.asOf.getTime();

  // 1. Filter by symbol and strict PIT availability
  const eligible = filings.filter((f) => {
    if (f.symbol !== options.symbol) return false;
    if (f.availableAt.getTime() > asOfMs) return false; // Strict future look-ahead block

    // Filter by target period if specified
    if (options.targetFiscalPeriod) {
      if (
        f.fiscalYear !== options.targetFiscalPeriod.fiscalYear ||
        f.fiscalPeriod !== options.targetFiscalPeriod.fiscalPeriod
      ) {
        return false;
      }
    }

    // Filter by period type if specified
    if (options.periodType === 'ANNUAL') {
      const isAnnual =
        f.fiscalPeriod === 'FY' ||
        f.form === '10-K' ||
        f.form === '10-K/A' ||
        f.form === '20-F' ||
        f.form === '20-F/A';
      if (!isAnnual) return false;
    } else if (options.periodType === 'QUARTERLY') {
      const isQuarterly =
        f.fiscalPeriod.startsWith('Q') ||
        f.form === '10-Q' ||
        f.form === '10-Q/A';
      if (!isQuarterly) return false;
    }

    // Filter by exact form if specified
    if (options.formType && options.formType !== 'ALL_PERIODIC') {
      const baseForm = options.formType.replace('/A', '');
      const currentBaseForm = f.form.replace('/A', '');
      if (baseForm !== currentBaseForm) return false;
    }

    return true;
  });

  if (eligible.length === 0) return null;

  // 2. Sort candidates:
  // Primary: economic period (endDate DESC) - we want the latest financial period
  // Secondary: acceptance time (acceptedDate DESC) - later amendments supersede earlier ones
  eligible.sort((a, b) => {
    const endDiff = b.endDate.getTime() - a.endDate.getTime();
    if (endDiff !== 0) return endDiff;
    return b.acceptedDate.getTime() - a.acceptedDate.getTime();
  });

  return eligible[0];
}

/**
 * Resolves the effective financial figures for an accounting period,
 * merging amendments with the base filing so that non-restated fields are inherited.
 */
export function resolvePeriodFiling(filingsForPeriod: FinancialFilingRecord[]): FinancialFilingRecord {
  if (filingsForPeriod.length === 0) {
    throw new Error('Cannot resolve empty filing list');
  }
  if (filingsForPeriod.length === 1) {
    return filingsForPeriod[0];
  }

  // Sort filings chronologically by acceptedDate ASC (oldest base filing first, latest amendment last)
  const sorted = [...filingsForPeriod].sort(
    (a, b) => a.acceptedDate.getTime() - b.acceptedDate.getTime()
  );

  // Start with the base filing
  const base = sorted[0];
  const merged: FinancialFilingRecord = { ...sorted[sorted.length - 1] }; // start with latest metadata

  // Financial fields subject to inheritance if null in amendment
  const metricKeys: (keyof FinancialFilingRecord)[] = [
    'revenue',
    'netIncome',
    'ebit',
    'grossProfit',
    'operatingCashFlow',
    'capex',
    'totalAssets',
    'totalLiabilities',
    'currentAssets',
    'currentLiabilities',
    'totalEquity',
    'sharesOutstanding',
    'cashAndEquivalents',
    'totalDebt',
  ];

  for (const key of metricKeys) {
    // Traverse from latest amendment back to base until a non-null value is found
    for (let i = sorted.length - 1; i >= 0; i--) {
      const val = sorted[i][key];
      if (val !== null && val !== undefined) {
        (merged as any)[key] = val;
        break;
      }
    }
  }

  return merged;
}

/**
 * Reconstructs the complete set of historical financial statements for a symbol
 * as known at instant asOf.
 * 
 * Deduplicates multiple filings for the same accounting period (fiscalYear, fiscalPeriod),
 * picking the latest version (original or amendment) that was publicly available at asOf.
 * Inherits non-restated fields from base filing if an amendment is partial.
 * 
 * Returns array of filings sorted by endDate DESC.
 */
export function getPointInTimeFinancialUniverse(
  filings: FinancialFilingRecord[],
  symbol: string,
  asOf: Date
): FinancialFilingRecord[] {
  const asOfMs = asOf.getTime();

  // 1. Filter by symbol and strict PIT availability
  const eligible = filings.filter(
    (f) => f.symbol === symbol && f.availableAt.getTime() <= asOfMs
  );

  // 2. Group by unique accounting period: `${fiscalYear}-${fiscalPeriod}`
  const periodMap = new Map<string, FinancialFilingRecord[]>();
  for (const f of eligible) {
    const key = `${f.fiscalYear}-${f.fiscalPeriod}`;
    const list = periodMap.get(key) ?? [];
    list.push(f);
    periodMap.set(key, list);
  }

  // 3. For each accounting period, resolve latest filing with partial amendment inheritance
  const results: FinancialFilingRecord[] = [];
  for (const [_, periodFilings] of periodMap.entries()) {
    results.push(resolvePeriodFiling(periodFilings));
  }

  // 4. Sort the entire series chronologically by endDate DESC
  results.sort((a, b) => b.endDate.getTime() - a.endDate.getTime());

  return results;
}

