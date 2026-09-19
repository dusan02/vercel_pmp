/**
 * Key Metrics consistency tests — the MU incident suite.
 *
 * Guards the invariants the audit established:
 *  1. current P/E = price / own TTM EPS — never Finnhub's possibly-stale ratio
 *  2. All flow metrics (True FCF, Op margin, CapEx/Rev, SBC/Rev) share the
 *     same TTM as-of period — mixing TTM margin with a fiscal-year margin
 *     produced "FCF margin 29% vs True FCF 1.9%" on the same page
 *  3. PEG is suppressed when Finnhub's P/E basis diverges >2× from ours —
 *     their PEG would answer a different question next to our P/E
 *  4. P/E percentile text never produces "top 0%"
 */
import { buildMetrics } from '@/components/company/analysis/KeyMetricsTable';
import { formatPePercentile } from '@/services/analysis/scoreCalculator';
import type { AnalysisData } from '@/components/company/analysis/types';

const analysisCacheFindUnique = jest.fn();
const statementFindMany = jest.fn();
const valuationFindFirst = jest.fn();
const finnhubFindUnique = jest.fn();

jest.mock('@/lib/db/prisma', () => ({
    prisma: {
        analysisCache: { findUnique: (...a: unknown[]) => analysisCacheFindUnique(...a) },
        financialStatement: { findMany: (...a: unknown[]) => statementFindMany(...a) },
        dailyValuationHistory: { findFirst: (...a: unknown[]) => valuationFindFirst(...a) },
        finnhubMetrics: { findUnique: (...a: unknown[]) => finnhubFindUnique(...a) },
        ticker: { findUnique: jest.fn() },
    },
}));

jest.mock('@/lib/utils/splitAdjustment', () => ({
    applySplitAdjustments: jest.fn(),
    applyPostSplitAdjustment: jest.fn(),
}));

// eslint-disable-next-line import/first
import { computeMetrics } from '@/services/analysisCompute';

// ── MU-shaped fixture: post-ramp TTM vs stale Finnhub snapshot ────────────────
// TTM (from statements): rev 90.28B, NI 50.47B, EBIT 55.59B, OCF 51.43B,
// CapEx 25.26B, SBC 1.2B. Finnhub's peRatio 129.3 implies ~$7.9 EPS ≈ FY2025.
const MU_TTM = {
    netIncome: 50.47e9,
    revenue: 90.28e9,
    ebit: 55.59e9,
    grossProfit: 37e9,
    operatingCashFlow: 51.43e9,
    capex: 25.26e9,
    sbc: 1.2e9,
};

function muData(overrides: Partial<AnalysisData> = {}): AnalysisData {
    return {
        healthScore: 100,
        profitabilityScore: 87,
        valuationScore: 55,
        verdictText: null,
        updatedAt: '2026-09-18T00:00:00Z',
        metrics: {
            zScore: null, altmanZ: 10.01, debtRepaymentTime: null, debtRepaymentYears: 0.1,
            fcfYield: 0.025, currentEps: 44.2, currentPe: 23.0,
            forwardPe: 5.9, forwardEps: 173, forwardImpliedGrowth: 291.4,
            fcfMargin: 0.29, fcfConversion: 0.52,
        },
        finnhub: {
            peRatio: 129.3, forwardPe: 5.87, pbRatio: null, psRatio: null,
            evEbitda: 15.9, grossMargin: null, operatingMargin: null, netMargin: null,
            roe: null, roa: null, roic: null, currentRatio: null, quickRatio: null,
            debtEquityRatio: null, interestCoverage: null, revenueGrowth: null,
            earningsGrowth: null, revenuePerShare: null, netIncomePerShare: 7.86,
            bookValuePerShare: null, freeCashFlowPerShare: null, dividendYield: 0.0005,
            payoutRatio: null, beta: null, pegRatio: 0.12, priceFreeCashFlow: null,
            fetchedAt: '2026-09-18T00:00:00Z',
        },
        ttm: { ...MU_TTM },
        ticker: { lastMarketCap: 1148.04 } as AnalysisData['ticker'],
        balanceSheet: {
            totalDebt: 5.72e9, cash: 26.02e9, netDebt: -20.3e9, totalEquity: 100.72e9,
            totalAssets: 171e9, totalLiabilities: 70e9, currentAssets: 60e9,
            currentLiabilities: 20e9, debtToEquity: 0.057, currentRatio: 3.0,
            assetToLiability: 2.44, netDebtToEbit: -0.37, sbc: 0.95e9,
            sbcToRevenue: null, sbcRatio: 1.9, sharesOutstanding: 1.142e9,
            dilution1y: 1.5, dilution5y: -2.0,
        },
        statements: [{ endDate: new Date(Date.now() - 30 * 86400e3) }] as never,
        ...overrides,
    } as unknown as AnalysisData;
}

function cell(metrics: { label: string; value: string }[], label: string) {
    return metrics.find(m => m.label === label);
}

describe('Key Metrics — P/E unified source', () => {
    it('displays own TTM P/E, not the divergent Finnhub ratio', () => {
        const { valuation } = buildMetrics(muData());
        const pe = cell(valuation, 'P/E (TTM)');
        expect(pe?.value).toBe('23.0x');
        expect(pe?.value).not.toContain('129');
    });

    it('suppresses PEG when Finnhub P/E diverges >2× from displayed P/E', () => {
        const { valuation } = buildMetrics(muData());
        expect(cell(valuation, 'PEG Ratio')?.value).toBe('N/A');
    });

    it('keeps PEG when Finnhub P/E agrees with ours', () => {
        const data = muData();
        data.finnhub!.peRatio = 24.1; // ~5% off our 23x — same basis
        const { valuation } = buildMetrics(data);
        expect(cell(valuation, 'PEG Ratio')?.value).toBe('0.12');
    });
});

describe('Key Metrics — single TTM as-of period', () => {
    it('True FCF margin = (TTM OCF − TTM CapEx − TTM SBC) / TTM revenue', () => {
        const { profitability } = buildMetrics(muData());
        const expected = (51.43e9 - 25.26e9 - 1.2e9) / 90.28e9;
        const cellVal = parseFloat(cell(profitability, 'True FCF Margin')!.value);
        expect(cellVal / 100).toBeCloseTo(expected, 3); // ~27.7%, not FY-only 1.9%
    });

    it('Operating margin, CapEx/Rev and SBC/Rev share the same TTM denominator', () => {
        const { profitability, growth, quality } = buildMetrics(muData());
        const R = MU_TTM.revenue;
        expect(parseFloat(cell(profitability, 'Operating Margin')!.value) / 100)
            .toBeCloseTo(MU_TTM.ebit / R, 3);
        expect(parseFloat(cell(quality, 'Capex / Revenue')!.value) / 100)
            .toBeCloseTo(MU_TTM.capex / R, 3);
        expect(parseFloat(cell(growth, 'SBC / Revenue')!.value) / 100)
            .toBeCloseTo(MU_TTM.sbc / R, 3);
    });

    it('True FCF margin reconciles with FCF margin: trueFcf = fcfMargin − sbc/rev', () => {
        const { profitability, growth } = buildMetrics(muData());
        const fcfM = muData().metrics!.fcfMargin!;
        const sbcRev = MU_TTM.sbc / MU_TTM.revenue;
        const implied = fcfM - sbcRev;
        const shown = parseFloat(cell(profitability, 'True FCF Margin')!.value) / 100;
        expect(shown).toBeCloseTo(implied, 2); // 29.0% − 1.3% ≈ 27.7% — same page, same period
        void growth;
    });

    it('flow metrics are N/A (never period-mixed) when TTM is unavailable', () => {
        const data = muData({ ttm: null });
        const { profitability, growth, quality } = buildMetrics(data);
        expect(cell(profitability, 'True FCF Margin')?.value).toBe('N/A');
        expect(cell(profitability, 'Operating Margin')?.value).toBe('N/A');
        expect(cell(quality, 'Capex / Revenue')?.value).toBe('N/A');
        expect(cell(growth, 'SBC / Revenue')?.value).toBe('N/A');
    });
});

describe('P/E percentile text', () => {
    it('never renders "top 0%" — absolute max gets explicit wording', () => {
        const text = formatPePercentile(129.3, 100);
        expect(text).toContain('highest in available history');
        expect(text).toContain('129.3x');
        expect(text).not.toContain('0%');
    });

    it('mid-range percentiles read as Nth percentile', () => {
        expect(formatPePercentile(23.0, 55)).toContain('55th percentile');
        expect(formatPePercentile(23.0, 72)).toContain('72nd percentile');
        expect(formatPePercentile(8.2, 21)).toContain('21st percentile');
    });

    it('absolute minimum is explicit too', () => {
        expect(formatPePercentile(5.5, 0.4)).toContain('lowest in available history');
    });
});

// ── computeMetrics: P/E must reconcile to price / own TTM EPS ────────────────
// Finnhub cumulative-YTD statement shape (Q3 = 9M cumulative, FY = full year):
// TTM = latestQ + matchingFY − sameQ_prevYear.
const MU_STMTS = [
    { fiscalPeriod: 'Q3', fiscalYear: 2026, endDate: new Date('2026-05-27'),
      revenue: 78.96e9, netIncome: 47.27e9, operatingCashFlow: 45.7e9, capex: 19.6e9,
      sbc: 0.95e9, ebit: 55.59e9, grossProfit: 33e9, totalEquity: 100.72e9,
      totalDebt: 5.72e9, cashAndEquivalents: 26.02e9, totalAssets: 171e9,
      totalLiabilities: 70e9, currentAssets: 60e9, currentLiabilities: 20e9,
      sharesOutstanding: 1.142e9, retainedEarnings: 50e9 },
    { fiscalPeriod: 'FY', fiscalYear: 2025, endDate: new Date('2025-08-28'),
      revenue: 37.38e9, netIncome: 8.54e9, operatingCashFlow: 17.53e9, capex: 15.86e9,
      sbc: 0.97e9, ebit: 9.77e9, grossProfit: 12e9, totalEquity: 54.17e9,
      totalDebt: 14.58e9, cashAndEquivalents: 10.31e9, totalAssets: 80e9,
      totalLiabilities: 26e9, currentAssets: 30e9, currentLiabilities: 12e9,
      sharesOutstanding: 1.125e9, retainedEarnings: 8e9 },
    { fiscalPeriod: 'Q3', fiscalYear: 2025, endDate: new Date('2025-05-28'),
      revenue: 26.06e9, netIncome: 5.34e9, operatingCashFlow: 11.8e9, capex: 10.2e9,
      sbc: 0.72e9, ebit: 6.12e9, grossProfit: 9e9, totalEquity: 50.75e9,
      totalDebt: 15.54e9, cashAndEquivalents: 10.81e9, totalAssets: 75e9,
      totalLiabilities: 24e9, currentAssets: 28e9, currentLiabilities: 11e9,
      sharesOutstanding: 1.123e9, retainedEarnings: 5e9 },
];

describe('computeMetrics — P/E source of truth', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        analysisCacheFindUnique.mockResolvedValue({
            symbol: 'MU', healthScore: 100, valuationScore: 55, profitabilityScore: 87,
            altmanZ: 10.01, debtRepaymentYears: 0.1, fcfMargin: 0.29, fcfConversion: 0.52,
        });
        statementFindMany.mockResolvedValue(MU_STMTS);
        valuationFindFirst.mockResolvedValue({
            closePrice: 1016.51, peRatio: 20.99, fcfYield: 0.0246,
        });
        finnhubFindUnique.mockResolvedValue({
            peRatio: 129.3, netIncomePerShare: 7.86, forwardPe: 5.87,
            pegRatio: 0.12, priceFreeCashFlow: 43.8,
        });
    });

    it('computes currentPe from price × shares / TTM net income, ignoring Finnhub peRatio', async () => {
        const result = await computeMetrics('MU', { lastPrice: 1016.51 });
        // TTM NI = 47.27 + 8.54 − 5.34 = 50.47B → P/E = 1016.51×1.142/50.47 ≈ 23.0
        expect(result!.metrics.currentPe).toBeCloseTo(23.0, 0);
        expect(result!.metrics.currentPe).not.toBeCloseTo(129.3, 0);
        // Finnhub value stays exported as diagnostics
        expect(result!.finnhub?.peRatio).toBe(129.3);
    });

    it('currentEps uses own TTM — keeping P/E reconcilable (price/EPS)', async () => {
        const result = await computeMetrics('MU', { lastPrice: 1016.51 });
        // 50.47B / 1.142B ≈ 44.2 — Finnhub's 7.86 would break the reconciliation
        expect(result!.metrics.currentEps).toBeCloseTo(44.2, 0);
        // forwardImpliedGrowth therefore measures vs OUR eps: 173/44.2 − 1 ≈ 291%
        expect(result!.metrics.forwardImpliedGrowth).toBeCloseTo(291, -1);
    });
});
