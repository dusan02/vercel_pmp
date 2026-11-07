/**
 * PMP Point-in-Time Quarterly Flow Normalizer (PMP v3.1.3-C3)
 * 
 * Accurately derives standalone 3-month quarterly flows from cumulative US-GAAP SEC filings:
 * 
 * Mathematical Rules for Flow Items (Revenue, Net Income, OCF, CapEx):
 * - Q1 discrete flow: Q1_discrete = Q1_reported
 * - Q2 discrete flow: Q2_discrete = YTD_6M - Q1_discrete (or reported standalone 3M)
 * - Q3 discrete flow: Q3_discrete = YTD_9M - YTD_6M (or reported standalone 3M)
 * - Q4 discrete flow: Q4_discrete = FY_12M - YTD_9M
 * - Trailing Twelve Months (TTM): TTM = Q1 + Q2 + Q3 + Q4
 * 
 * Instant Items (Balance Sheet: Assets, Liabilities, Equity, Cash, Debt, Shares):
 * - NEVER subtracted! Represent point-in-time state as of period end date.
 */

import { FinancialFilingRecord } from './pit-filing-service';

export interface DiscreteQuarterlyFlows {
  symbol: string;
  fiscalYear: number;
  fiscalPeriod: string; // "Q1", "Q2", "Q3", "Q4", "FY"
  periodEndDate: Date;
  isDerived: boolean;
  
  // Discrete (standalone single-quarter 3M or full FY 12M) flows:
  discreteRevenue: number | null;
  discreteNetIncome: number | null;
  discreteOperatingCashFlow: number | null;
  discreteCapex: number | null;
  discreteGrossProfit: number | null;
  discreteEbit: number | null;

  // Cumulative YTD flows:
  cumulativeRevenue: number | null;
  cumulativeNetIncome: number | null;
  cumulativeOperatingCashFlow: number | null;

  // Point-in-time Instant (Balance sheet) metrics (never subtracted):
  totalAssets: number | null;
  totalLiabilities: number | null;
  totalEquity: number | null;
  cashAndEquivalents: number | null;
  totalDebt: number | null;
  sharesOutstanding: number | null;
}

/**
 * Normalizes an array of filings for a given symbol and fiscal year into discrete quarterly flows.
 */
export function normalizeFiscalYearQuarterlyFlows(
  filingsForFiscalYear: FinancialFilingRecord[]
): Map<string, DiscreteQuarterlyFlows> {
  const result = new Map<string, DiscreteQuarterlyFlows>();

  // Sort filings chronologically by period: Q1 -> Q2 -> Q3 -> FY
  const periodOrder: Record<string, number> = { Q1: 1, Q2: 2, Q3: 3, Q4: 4, FY: 5 };
  const sorted = [...filingsForFiscalYear].sort(
    (a, b) => (periodOrder[a.fiscalPeriod] || 99) - (periodOrder[b.fiscalPeriod] || 99)
  );

  let q1Flow: DiscreteQuarterlyFlows | null = null;
  let q2Flow: DiscreteQuarterlyFlows | null = null;
  let q3Flow: DiscreteQuarterlyFlows | null = null;

  for (const f of sorted) {
    const fp = f.fiscalPeriod;
    const rev = f.revenue;
    const ni = f.netIncome;
    const ocf = f.operatingCashFlow;
    const capex = f.capex;
    const gp = f.grossProfit;
    const ebit = f.ebit;

    if (fp === 'Q1') {
      // Q1 is inherently standalone 3-month flow
      q1Flow = {
        symbol: f.symbol,
        fiscalYear: f.fiscalYear,
        fiscalPeriod: 'Q1',
        periodEndDate: f.endDate,
        isDerived: false,
        discreteRevenue: rev,
        discreteNetIncome: ni,
        discreteOperatingCashFlow: ocf,
        discreteCapex: capex,
        discreteGrossProfit: gp,
        discreteEbit: ebit,
        cumulativeRevenue: rev,
        cumulativeNetIncome: ni,
        cumulativeOperatingCashFlow: ocf,
        totalAssets: f.totalAssets,
        totalLiabilities: f.totalLiabilities,
        totalEquity: f.totalEquity,
        cashAndEquivalents: f.cashAndEquivalents,
        totalDebt: f.totalDebt,
        sharesOutstanding: f.sharesOutstanding,
      };
      result.set('Q1', q1Flow);
    } else if (fp === 'Q2') {
      // In Form 10-Q, Income Statement reports both 3M and 6M, or 6M cumulative.
      // If cumulative is reported, derive Q2 = 6M - Q1
      const q1Rev = q1Flow?.cumulativeRevenue ?? null;
      const q1Ni = q1Flow?.cumulativeNetIncome ?? null;

      // If rev is 6M cumulative:
      const derivedRev = rev !== null && q1Rev !== null && rev > q1Rev ? rev - q1Rev : rev;
      const derivedNi = ni !== null && q1Ni !== null ? ni - q1Ni : ni;

      q2Flow = {
        symbol: f.symbol,
        fiscalYear: f.fiscalYear,
        fiscalPeriod: 'Q2',
        periodEndDate: f.endDate,
        isDerived: derivedRev !== rev,
        discreteRevenue: derivedRev,
        discreteNetIncome: derivedNi,
        discreteOperatingCashFlow: ocf,
        discreteCapex: capex,
        discreteGrossProfit: gp,
        discreteEbit: ebit,
        cumulativeRevenue: rev,
        cumulativeNetIncome: ni,
        cumulativeOperatingCashFlow: ocf,
        totalAssets: f.totalAssets,
        totalLiabilities: f.totalLiabilities,
        totalEquity: f.totalEquity,
        cashAndEquivalents: f.cashAndEquivalents,
        totalDebt: f.totalDebt,
        sharesOutstanding: f.sharesOutstanding,
      };
      result.set('Q2', q2Flow);
    } else if (fp === 'Q3') {
      // Q3 = 9M cumulative - 6M cumulative
      const q2CumulativeRev = q2Flow?.cumulativeRevenue ?? null;
      const q2CumulativeNi = q2Flow?.cumulativeNetIncome ?? null;

      const derivedRev = rev !== null && q2CumulativeRev !== null && rev > q2CumulativeRev ? rev - q2CumulativeRev : rev;
      const derivedNi = ni !== null && q2CumulativeNi !== null ? ni - q2CumulativeNi : ni;

      q3Flow = {
        symbol: f.symbol,
        fiscalYear: f.fiscalYear,
        fiscalPeriod: 'Q3',
        periodEndDate: f.endDate,
        isDerived: derivedRev !== rev,
        discreteRevenue: derivedRev,
        discreteNetIncome: derivedNi,
        discreteOperatingCashFlow: ocf,
        discreteCapex: capex,
        discreteGrossProfit: gp,
        discreteEbit: ebit,
        cumulativeRevenue: rev,
        cumulativeNetIncome: ni,
        cumulativeOperatingCashFlow: ocf,
        totalAssets: f.totalAssets,
        totalLiabilities: f.totalLiabilities,
        totalEquity: f.totalEquity,
        cashAndEquivalents: f.cashAndEquivalents,
        totalDebt: f.totalDebt,
        sharesOutstanding: f.sharesOutstanding,
      };
      result.set('Q3', q3Flow);
    } else if (fp === 'FY' || f.form === '10-K') {
      // Q4 discrete = FY 12M - Q3 9M cumulative
      const q3CumulativeRev = q3Flow?.cumulativeRevenue ?? null;
      const q3CumulativeNi = q3Flow?.cumulativeNetIncome ?? null;

      const discreteQ4Rev = rev !== null && q3CumulativeRev !== null ? rev - q3CumulativeRev : null;
      const discreteQ4Ni = ni !== null && q3CumulativeNi !== null ? ni - q3CumulativeNi : null;

      if (discreteQ4Rev !== null || discreteQ4Ni !== null) {
        result.set('Q4', {
          symbol: f.symbol,
          fiscalYear: f.fiscalYear,
          fiscalPeriod: 'Q4',
          periodEndDate: f.endDate,
          isDerived: true,
          discreteRevenue: discreteQ4Rev,
          discreteNetIncome: discreteQ4Ni,
          discreteOperatingCashFlow: null,
          discreteCapex: null,
          discreteGrossProfit: null,
          discreteEbit: null,
          cumulativeRevenue: rev,
          cumulativeNetIncome: ni,
          cumulativeOperatingCashFlow: ocf,
          totalAssets: f.totalAssets,
          totalLiabilities: f.totalLiabilities,
          totalEquity: f.totalEquity,
          cashAndEquivalents: f.cashAndEquivalents,
          totalDebt: f.totalDebt,
          sharesOutstanding: f.sharesOutstanding,
        });
      }

      // Also record the full FY 12M flow
      result.set('FY', {
        symbol: f.symbol,
        fiscalYear: f.fiscalYear,
        fiscalPeriod: 'FY',
        periodEndDate: f.endDate,
        isDerived: false,
        discreteRevenue: rev,
        discreteNetIncome: ni,
        discreteOperatingCashFlow: ocf,
        discreteCapex: capex,
        discreteGrossProfit: gp,
        discreteEbit: ebit,
        cumulativeRevenue: rev,
        cumulativeNetIncome: ni,
        cumulativeOperatingCashFlow: ocf,
        totalAssets: f.totalAssets,
        totalLiabilities: f.totalLiabilities,
        totalEquity: f.totalEquity,
        cashAndEquivalents: f.cashAndEquivalents,
        totalDebt: f.totalDebt,
        sharesOutstanding: f.sharesOutstanding,
      });
    }
  }

  return result;
}

/**
 * Calculates strict Trailing Twelve Months (TTM) as of any available date.
 * Sums the discrete flows of the 4 trailing quarters without double-counting cumulative numbers.
 */
export function calculatePointInTimeTTM(
  quarterlyFlows: DiscreteQuarterlyFlows[]
): { ttmRevenue: number | null; ttmNetIncome: number | null; quartersCount: number } {
  // Filter for valid discrete quarters Q1, Q2, Q3, Q4
  const quarters = quarterlyFlows.filter((q) => q.fiscalPeriod.startsWith('Q'));
  if (quarters.length < 4) {
    return { ttmRevenue: null, ttmNetIncome: null, quartersCount: quarters.length };
  }

  // Take latest 4 discrete quarters
  const trailing4 = quarters.slice(0, 4);

  let revSum = 0;
  let niSum = 0;
  let revValid = true;
  let niValid = true;

  for (const q of trailing4) {
    if (q.discreteRevenue !== null) revSum += q.discreteRevenue;
    else revValid = false;

    if (q.discreteNetIncome !== null) niSum += q.discreteNetIncome;
    else niValid = false;
  }

  return {
    ttmRevenue: revValid ? revSum : null,
    ttmNetIncome: niValid ? niSum : null,
    quartersCount: trailing4.length,
  };
}
