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
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { KeyInsightsSection } from '@/components/company/analysis/sections/KeyInsightsSection';
import { get52WeekRange, getAnalysisQuote } from '@/lib/analysis/pageData';
import { summarizeLossYears } from '@/lib/utils/analysisMath';
import { buildAnalysisFaq } from '@/components/company/analysis/sections/AnalysisFaqSection';
import { GET as getHistory } from '@/app/api/analysis/[ticker]/history/route';
import { generateCompanyMetadata } from '@/lib/seo/metadata';
import robots from '@/app/robots';

jest.mock('next/server', () => ({
    NextResponse: { json: (body: unknown) => ({ json: async () => body }) },
}));
jest.mock('@/lib/redis/operations', () => ({
    getCachedData: jest.fn().mockResolvedValue(null),
    setCachedData: jest.fn(),
    del: jest.fn(),
}));

const analysisCacheFindUnique = jest.fn();
const statementFindMany = jest.fn();
const valuationFindMany = jest.fn();
const finnhubFindUnique = jest.fn();
const valuationAggregate = jest.fn();
const dailyRefAggregate = jest.fn();

jest.mock('@/lib/db/prisma', () => ({
    prisma: {
        analysisCache: { findUnique: (...a: unknown[]) => analysisCacheFindUnique(...a) },
        financialStatement: { findMany: (...a: unknown[]) => statementFindMany(...a) },
        dailyValuationHistory: {
            findMany: (...a: unknown[]) => valuationFindMany(...a),
            aggregate: (...a: unknown[]) => valuationAggregate(...a),
        },
        dailyRef: { aggregate: (...a: unknown[]) => dailyRefAggregate(...a) },
        finnhubMetrics: { findUnique: (...a: unknown[]) => finnhubFindUnique(...a) },
        ticker: { findUnique: jest.fn() },
    },
}));

jest.mock('@/lib/utils/splitAdjustment', () => ({
    applySplitAdjustments: jest.fn().mockResolvedValue([]),
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
            psRatio: 12.72, evEbit: 20.5,
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

// Sparse daily-history fixture — current ~23x should land mid-range.
const MU_VALUATION_ROWS = [10, 15, 20, 25, 30].map((pe, i) => ({
    date: new Date(Date.UTC(2025, 0, 2 + i)),
    closePrice: 100 + i, marketCap: 114e9,
    peRatio: pe, psRatio: 2 + i, evEbitda: 8 + i * 2, fcfYield: 0.01 + i * 0.005,
}));

describe('computeMetrics — P/E source of truth', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        analysisCacheFindUnique.mockResolvedValue({
            symbol: 'MU', healthScore: 100, valuationScore: 55, profitabilityScore: 87,
            altmanZ: 10.01, debtRepaymentYears: 0.1, fcfMargin: 0.29, fcfConversion: 0.52,
        });
        statementFindMany.mockResolvedValue(MU_STMTS);
        valuationFindMany.mockResolvedValue(MU_VALUATION_ROWS);
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

    it('FCF yield uses own TTM FCF / market cap — same basis as FCF margin', async () => {
        const result = await computeMetrics('MU', { lastPrice: 1016.51 });
        // TTM FCF = 51.43 − 25.26 = 26.17B; mcap = 1016.51 × 1.142B = 1160.9B
        // → 2.25%, not the stale annual snapshot (2.46%) nor Finnhub's inverse.
        expect(result!.metrics.fcfYield).toBeCloseTo(26.17e9 / (1016.51 * 1.142e9), 6);
    });
});

describe('valuation history stats — percentile vs own history', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        analysisCacheFindUnique.mockResolvedValue({
            symbol: 'MU', healthScore: 100, valuationScore: 55, profitabilityScore: 87,
            altmanZ: 10.01, debtRepaymentYears: 0.1, fcfMargin: 0.29, fcfConversion: 0.52,
        });
        statementFindMany.mockResolvedValue(MU_STMTS);
        valuationFindMany.mockResolvedValue(MU_VALUATION_ROWS);
        finnhubFindUnique.mockResolvedValue({
            peRatio: 129.3, netIncomePerShare: 7.86, forwardPe: 5.87,
            pegRatio: 0.12, priceFreeCashFlow: 43.8,
        });
    });

    it('ranks our TTM P/E against the stored series — not Finnhub\'s', async () => {
        const result = await computeMetrics('MU', { lastPrice: 1016.51 });
        const pe = result!.valuationHistoryStats!.pe;
        expect(pe.current).toBeCloseTo(23.0, 0);
        // history [10,15,20,25,30] → 3 of 5 below 23 → 60th percentile
        expect(pe.percentile).toBeCloseTo(60, 0);
        expect(pe.min).toBe(10);
        expect(pe.max).toBe(30);
        expect(pe.sampleSize).toBe(5);
    });

    it('returns null stats object when no history rows exist', async () => {
        valuationFindMany.mockResolvedValue([]);
        const result = await computeMetrics('MU', { lastPrice: 1016.51 });
        expect(result!.valuationHistoryStats).toBeNull();
    });
});

describe('Analysis audit regressions', () => {
    it('uses official close and its reference for every closed-session quote', () => {
        const data = { lastPrice: 334.87, lastChangePct: -0.37,
            lastClosedRef: { regularClose: 336.13, previousClose: 337 } };
        expect(getAnalysisQuote(data, 'closed')).toMatchObject({ price: 336.13 });
        expect(getAnalysisQuote(data, 'closed').changePct).toBeCloseTo(-0.25816, 4);
        for (const session of ['pre', 'live', 'after'] as const) {
            expect(getAnalysisQuote(data, session)).toMatchObject({ price: 334.87, changePct: -0.37 });
        }
        expect(getAnalysisQuote({ ...data, lastClosedRef: null }, 'closed')).toMatchObject({ price: null, changePct: null });
        expect(getAnalysisQuote({ ...data, lastClosedRef: { regularClose: 336.13, previousClose: 0 } }, 'closed'))
            .toMatchObject({ price: 336.13, changePct: null });
    });

    it.each([['pre', 'pre-market trading'], ['live', 'regular session'], ['after', 'after-hours trading'], ['closed', 'last market close']])('labels %s correctly in FAQ and schema text', (marketSession, label) => {
        const items = buildAnalysisFaq({ ticker: 'AAPL', companyName: 'Apple', price: 336.13, changePct: -0.26,
            marketSession: marketSession!, healthScore: null, verdictText: null, peRatio: null,
            valuationScore: null, sector: null, industry: null, description: null, earningsDate: null, earningsDays: null });
        expect(items[0]?.a).toContain(label);
    });

    it('counts completed annual loss years only, not FY plus cumulative quarters', () => {
        const statements = Array.from({ length: 10 }, (_, i) => ({
            fiscalYear: 2025 - i, fiscalPeriod: 'FY', endDate: `${2025 - i}-12-31`, netIncome: i < 6 ? 100 : -100,
        }));
        expect(summarizeLossYears([
            ...statements,
            { fiscalYear: 2025, fiscalPeriod: 'Q1', netIncome: -1000 },
            { fiscalYear: 2026, fiscalPeriod: 'Q1', netIncome: -1000 },
            { fiscalYear: 2015, fiscalPeriod: 'FY', netIncome: -1000 },
        ])).toEqual({ lossYears: 4, reportedYears: 10, firstYear: 2016, lastYear: 2025 });
        expect(summarizeLossYears(statements.slice(0, 4)).lossYears).toBe(0);
        expect(summarizeLossYears([]).reportedYears).toBe(0);
    });

    it('uses own TTM EPS in Per Share rather than a conflicting vendor EPS', () => {
        expect(cell(buildMetrics(muData()).perShare, 'EPS (TTM)')?.value).toBe('$44.20');
        const data = muData();
        data.finnhub!.netIncomePerShare = null;
        expect(cell(buildMetrics(data).perShare, 'EPS (TTM)')?.value).toBe('$44.20');
        data.metrics.currentEps = null;
        expect(cell(buildMetrics(data).perShare, 'EPS (TTM)')?.value).toBe('N/A');
    });

    it.each([-9e9, 0])('does not grade non-positive equity as low debt: %s', equity => {
        const data = muData();
        data.balanceSheet!.totalEquity = equity;
        data.balanceSheet!.debtToEquity = -5.33;
        const debt = buildMetrics(data).solvency.find(m => m.label === 'Debt/Equity');
        expect(debt?.value).toBe('N/A');
        expect(debt?.statusLabel).toBe('-');
        expect(debt?.hint).toContain('non-positive equity');
    });

    it('does not rate a negative vendor debt/equity fallback as conservative', () => {
        const data = muData({ balanceSheet: null });
        data.finnhub!.debtEquityRatio = -5.33;
        expect(cell(buildMetrics(data).solvency, 'Debt/Equity')?.value).toBe('N/A');
    });

    it('keeps high positive P/E in history and never calls an older valid row current', async () => {
        statementFindMany.mockResolvedValue([]);
        valuationFindMany.mockResolvedValue([
            { date: new Date('2025-09-04'), peRatio: 196.48, psRatio: 10, closePrice: 300 },
            { date: new Date('2026-09-18'), peRatio: 333.5, psRatio: 14.7, closePrice: 364.27 },
        ]);
        const result = await getHistory({} as Request, { params: Promise.resolve({ ticker: 'TSLA' }) });
        const data = await result.json();
        expect(data.current.pe).toBe(333.5);
        expect(data.peHistory.at(-1)).toMatchObject({ value: 333.5 });
        valuationFindMany.mockResolvedValue([
            { date: new Date('2025-09-04'), peRatio: 196.48, psRatio: 10, closePrice: 300 },
            { date: new Date('2026-09-18'), peRatio: null, psRatio: 14.7, closePrice: 364.27 },
        ]);
        const missing = await getHistory({} as Request, { params: Promise.resolve({ ticker: 'TSLA' }) });
        expect((await missing.json()).current.pe).toBeNull();
    });

    it('gets a covered 52-week closing range from daily history', async () => {
        valuationAggregate.mockResolvedValue({
            _min: { closePrice: 293.41, date: new Date(Date.now() - 364 * 86400e3) },
            _max: { closePrice: 481.57, date: new Date(Date.now() - 3 * 86400e3) },
            _count: { closePrice: 250 },
        });
        expect(await get52WeekRange('AVGO')).toEqual({ low: 293.41, high: 481.57 });
        expect(dailyRefAggregate).not.toHaveBeenCalled();
    });

    it('hides a short or stale range instead of labeling it 52WK', async () => {
        for (const [days, count, lastDays] of [[9, 9, 1], [364, 250, 30], [364, 20, 1]]) {
            valuationAggregate.mockResolvedValue({
                _min: { closePrice: 339, date: new Date(Date.now() - days! * 86400e3) },
                _max: { closePrice: 368, date: new Date(Date.now() - lastDays! * 86400e3) },
                _count: { closePrice: count },
            });
            expect(await get52WeekRange('AVGO')).toBeNull();
        }
    });

    it('does not describe a historical loss count as losses in the last four years', () => {
        const html = renderToStaticMarkup(React.createElement(KeyInsightsSection, {
            ticker: 'TSLA', companyName: 'Tesla', changePct: null, marketSession: 'closed',
            cache: { valuationScore: 20, verdictText: 'Neutral', piotroskiScore: null, altmanZ: null,
                beneishScore: null, revenueCagr: null, netIncomeCagr: null, fcfMargin: null,
                debtRepaymentYears: null, interestCoverage: null, negativeNiYears: 4,
                humanDebtInfo: null, humanPeInfo: null },
            peRatio: 333.5, roe: null, dividendYield: null, earningsDays: null,
            moversReason: null, moversCategory: null,
        }));
        expect(html).not.toContain('last four reporting years');
    });

    it('allows Next static assets while keeping internal routes out of crawler rules', () => {
        const rules = robots().rules as { userAgent: string; allow?: string | string[]; disallow?: string[] }[];
        const rule = rules.find(r => r.userAgent === '*')!;
        const allowed = Array.isArray(rule.allow) ? rule.allow : [rule.allow];
        expect(allowed).toContain('/_next/static/');
        expect(allowed).toContain('/_next/image');
        expect(rule.disallow).toEqual(expect.arrayContaining(['/api/', '/admin/']));
    });

    it('uses ticker-specific images for both Open Graph and Twitter', () => {
        const metadata = generateCompanyMetadata({ ticker: 'AVGO', companyName: 'Broadcom' });
        expect(metadata.openGraph?.images).toEqual(expect.arrayContaining([
            expect.objectContaining({ url: 'https://premarketprice.com/analysis/AVGO/opengraph-image' }),
        ]));
        expect(metadata.twitter?.images).toEqual(['https://premarketprice.com/analysis/AVGO/opengraph-image']);
    });
});

describe('summarizeSeries', () => {
    it('computes percentile as share of history strictly below current', async () => {
        const { summarizeSeries } = await import('@/services/analysis/valuationHistory');
        const s = summarizeSeries([5, 10, 15, 20], 12, 10);
        expect(s.percentile).toBe(50); // 5,10 below → 2/4
        expect(s.median).toBe(12.5);
    });

    it('handles empty series and null current', async () => {
        const { summarizeSeries } = await import('@/services/analysis/valuationHistory');
        const empty = summarizeSeries([], 20, null);
        expect(empty).toMatchObject({ percentile: null, sampleSize: 0, min: null });
        const noCurrent = summarizeSeries([10, 20, 30], null, 3);
        expect(noCurrent.percentile).toBeNull();
        expect(noCurrent.min).toBe(10);
    });
});
