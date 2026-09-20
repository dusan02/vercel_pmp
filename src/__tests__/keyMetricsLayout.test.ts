/**
 * Key Metrics pillar layout — structural regression tests.
 *
 * Guards the redesign invariants:
 *  1. Five pillar groups render (Valuation/Growth/Profitability/Financial
 *     Health/Quality) plus the Balance Sheet context card
 *  2. Pillar header shows the same score as the radar (data.pillars)
 *  3. Missing metrics keep their row and render as '—', never disappear
 *  4. Pillar-leg metrics (P/FCF, EPS CAGR, Forward Growth) render real
 *     values from the existing payload — nothing is recomputed client-side
 *  5. FCF Conversion lives under Quality (it moved out of Profitability)
 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { KeyMetricsTable, buildMetrics } from '@/components/company/analysis/KeyMetricsTable';
import { computePillars } from '@/services/analysis/pillars';
import type { AnalysisData } from '@/components/company/analysis/types';

function fixture(overrides: Partial<AnalysisData> = {}): AnalysisData {
    return {
        healthScore: 80, profitabilityScore: 90, valuationScore: 40,
        verdictText: null, updatedAt: '2026-09-18T00:00:00Z',
        metrics: {
            zScore: null, altmanZ: 6.45, debtRepaymentTime: null, debtRepaymentYears: 0.4,
            fcfYield: 0.048, currentEps: 12.1, currentPe: 14.0,
            psRatio: 3.9, evEbit: 12.2,
            forwardPe: 13.5, forwardEps: 13.0, forwardImpliedGrowth: 7.4,
            fcfMargin: 0.408, fcfConversion: 0.95,
        },
        finnhub: {
            peRatio: 14.2, forwardPe: 13.4, pbRatio: 2.1, psRatio: null,
            evEbitda: 11.8, grossMargin: null, operatingMargin: null, netMargin: null,
            roe: 35.1, roa: null, roic: null, currentRatio: 1.5, quickRatio: null,
            debtEquityRatio: 0.4, interestCoverage: 25.0, revenueGrowth: null,
            earningsGrowth: null, revenuePerShare: null, netIncomePerShare: null,
            bookValuePerShare: null, freeCashFlowPerShare: null, dividendYield: null,
            payoutRatio: null, beta: null, pegRatio: 1.2, priceFreeCashFlow: 20.4,
            fetchedAt: '2026-09-18T00:00:00Z',
        },
        ttm: {
            netIncome: 7.4e9, revenue: 25.5e9, ebit: 8.2e9, grossProfit: 21e9,
            operatingCashFlow: 9.9e9, capex: -1.5e9, sbc: 0.4e9,
        },
        ticker: { lastMarketCap: 118.5 } as AnalysisData['ticker'],
        balanceSheet: {
            totalDebt: 13e9, cash: 25e9, netDebt: -12e9, totalEquity: 24e9,
            totalAssets: 30e9, totalLiabilities: 6e9, currentAssets: 29e9,
            currentLiabilities: 19e9, debtToEquity: 0.54, currentRatio: 1.5,
            assetToLiability: 5.0, netDebtToEbit: -1.4, sbc: 0.4e9,
            sbcToRevenue: null, sbcRatio: 5.4, sharesOutstanding: 0.45e9,
            dilution1y: 0.5, dilution5y: -1.2,
        } as AnalysisData['balanceSheet'],
        revenueCagr: 11.7, netIncomeCagr: -8.6, epsCagr5y: 8.3,
        piotroskiScore: 7, beneishScore: -3.02, marginStability: 0.04,
        statements: [{ endDate: new Date() }] as never,
        pillars: computePillars({
            pePercentile: 30, fcfYield: 0.048, psRatio: 3.9, evEbit: 12.2,
            revenueCagr: 11.7, netIncomeCagr: -8.6, epsCagr5y: 8.3, forwardImpliedGrowth: 7.4,
            roic: 0.27, roe: 0.31, netMargin: 0.29, operatingMargin: 0.32,
            altmanZ: 6.45, currentRatio: 1.5, interestCoverage: 25, netCash: true, debtRatio: null,
            piotroski: 7, beneish: -3.02, fcfConversion: 0.95, marginStability: 0.04,
        }),
        ...overrides,
    } as unknown as AnalysisData;
}

function render(data: AnalysisData): string {
    return renderToStaticMarkup(React.createElement(KeyMetricsTable, { data }));
}

describe('Key Metrics — pillar layout', () => {
    it('renders all five pillar groups plus Balance Sheet', () => {
        const html = render(fixture());
        for (const t of ['>Valuation<', '>Growth<', '>Profitability<', '>Financial Health<', '>Quality<', '>Balance Sheet<']) {
            expect(html).toContain(t);
        }
    });

    it('shows the pillar score in each card header — same value as the radar', () => {
        const data = fixture();
        const html = render(data);
        // Growth score = 20+0+12+12 = 44 → must appear as "44/100"
        expect(html).toContain(`${data.pillars!.growth.score}<span`);
        expect(html).toContain(`${data.pillars!.valuation.score}<span`);
    });

    it('missing metrics keep their row and render as —', () => {
        const data = fixture({ epsCagr5y: null });
        data.metrics!.forwardImpliedGrowth = null;
        const html = render(data);
        // Row labels still present, values rendered as the muted dash
        expect(html).toContain('EPS CAGR (5Y)');
        expect(html).toContain('Forward Growth');
        expect(html).toContain('—');
        // No raw "N/A" text leaks into the markup
        expect(html).not.toContain('>N/A<');
    });

    it('renders P/FCF, EPS CAGR and Forward Growth from existing payload fields', () => {
        const html = render(fixture());
        expect(html).toContain('P/FCF');
        expect(html).toContain('20.4x');          // finnhub.priceFreeCashFlow
        expect(html).toContain('8.3%');           // epsCagr5y
        expect(html).toContain('7.4%');           // forwardImpliedGrowth
    });

    it('FCF Conversion sits in the Quality group, not Profitability', () => {
        const { quality, profitability } = buildMetrics(fixture());
        expect(quality.some(m => m.label === 'FCF Conversion')).toBe(true);
        expect(profitability.some(m => m.label === 'FCF Conversion')).toBe(false);
    });

    it('values render unchanged from buildMetrics (no client-side recomputation)', () => {
        const data = fixture();
        const { valuation, growth } = buildMetrics(data);
        const html = render(data);
        for (const m of [...valuation, ...growth]) {
            if (m.value !== 'N/A') expect(html).toContain(m.value);
        }
    });

    it('works without pillar scores — cards render scoreless headers', () => {
        const html = render(fixture({ pillars: null }));
        expect(html).toContain('>Valuation<');
        expect(html).not.toContain('/100');
    });
});
