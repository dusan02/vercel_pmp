/**
 * Heatmap 5-pillar score consistency.
 *
 * The heatmap must expose the same five canonical AnalysisCache scores
 * used by Analysis, Screener, Earnings and Movers:
 *   valuationScore / growthScore / profitabilityScore / healthScore / qualityScore
 * Never recompute — the values pass straight through the pipeline:
 *   fetcher select → payload row → compact wire key → CompanyNode → metric value.
 */
// metricValue imports heatmapColors → d3-scale (ESM). Color scales aren't
// under test here — mock the module so Jest never loads d3.
jest.mock('@/lib/utils/heatmapColors', () => ({
    getMetricNeutralPoint: () => 50,
}));

import { HEATMAP_METRICS, getCompanyMetricValue, formatMetricNumber } from '@/lib/heatmap/metricValue';
import { toCompactRow, type HeatmapPayloadRow } from '@/lib/heatmap/heatmapTransformer';
import type { CompanyNode, HeatmapMetric } from '@/lib/heatmap/types';

const SCORE_METRICS: { metric: HeatmapMetric; field: keyof CompanyNode; compactKey: string }[] = [
    { metric: 'valuation', field: 'valuationScore', compactKey: 'vs' },
    { metric: 'growth', field: 'growthScore', compactKey: 'gs' },
    { metric: 'profitability', field: 'profitabilityScore', compactKey: 'ps' },
    { metric: 'health', field: 'healthScore', compactKey: 'hs' },
    { metric: 'quality', field: 'qualityScore', compactKey: 'qs' },
];

describe('heatmap five-pillar score metrics', () => {
    it('exposes all five canonical scores in the metric registry', () => {
        const ids = HEATMAP_METRICS.map(m => m.id);
        for (const { metric } of SCORE_METRICS) {
            expect(ids).toContain(metric);
        }
    });

    it('resolves each score metric straight from the AnalysisCache field', () => {
        const company = {
            symbol: 'ADBE', name: 'Adobe', sector: 'Technology', industry: 'Software',
            marketCap: 100, changePercent: 0,
            valuationScore: 90, growthScore: 85, profitabilityScore: 100,
            healthScore: 76, qualityScore: 97,
        } as CompanyNode;
        const expected: Record<string, number> = {
            valuation: 90, growth: 85, profitability: 100, health: 76, quality: 97,
        };
        for (const { metric } of SCORE_METRICS) {
            expect(getCompanyMetricValue(company, metric)).toBe(expected[metric]);
        }
    });

    it('returns null (neutral tile) when a score is missing', () => {
        const company = {
            symbol: 'X', name: 'X', sector: 'S', industry: 'I',
            marketCap: 1, changePercent: 0,
        } as CompanyNode;
        for (const { metric } of SCORE_METRICS) {
            expect(getCompanyMetricValue(company, metric)).toBeNull();
        }
    });

    it('carries all five scores through the compact wire format', () => {
        const row = {
            ticker: 'AAPL', companyName: 'Apple', sector: 'Technology', industry: 'Hardware',
            marketCap: 3000, percentChange: 1, marketCapDiff: 10, currentPrice: 200,
            valuationScore: 55, growthScore: 62, profitabilityScore: 98,
            healthScore: 81, qualityScore: 90,
        } as HeatmapPayloadRow;
        const compact = toCompactRow(row);
        for (const { compactKey } of SCORE_METRICS) {
            expect(compact).toHaveProperty(compactKey);
        }
        expect(compact.gs).toBe(62);
        expect(compact.qs).toBe(90);
    });

    it('formats scores as 0-100 integers', () => {
        for (const { metric } of SCORE_METRICS) {
            expect(formatMetricNumber(84.6, metric)).toBe('85');
        }
    });
});
