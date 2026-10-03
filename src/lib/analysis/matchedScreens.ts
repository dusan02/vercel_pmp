import { cache } from 'react';
import { prisma } from '@/lib/db/prisma';
import { QUICK_SCREENS, matchesPreset, presetToQueryString } from '@/lib/utils/screener';

export interface MatchedScreen {
    label: string;
    tip?: string;
    /** /screener pre-loaded with this screen's filters — internal deep link. */
    href: string;
}

/**
 * Which quick-screen presets this ticker currently satisfies. Dedicated
 * lean query (kept out of getTickerData's minimal selects) — one indexed
 * findUnique + three 1:1 relations, ISR-cached with the page render.
 */
export const getMatchedScreens = cache(async (symbol: string): Promise<MatchedScreen[]> => {
    const t = await prisma.ticker.findUnique({
        where: { symbol },
        select: {
            lastPrice: true,
            lastChangePct: true,
            lastMarketCap: true,
            analysisCache: {
                select: {
                    healthScore: true, profitabilityScore: true, valuationScore: true,
                    growthScore: true, qualityScore: true, overallScore: true,
                    altmanZ: true, fcfMargin: true,
                },
            },
            finnhubMetrics: {
                select: {
                    peRatio: true, forwardPe: true, psRatio: true, pbRatio: true,
                    pegRatio: true, evEbitda: true, evSales: true,
                    priceFreeCashFlow: true, priceCashFlow: true,
                    roe: true, roa: true, grossMargin: true, operatingMargin: true,
                    netMargin: true, revenueGrowth: true, earningsGrowth: true,
                    bookValueGrowth: true, dividendYield: true, payoutRatio: true,
                    beta: true, currentRatio: true, quickRatio: true,
                    debtEquityRatio: true, interestCoverage: true,
                    week52Position: true,
                },
            },
            insiderAggregate: {
                select: { netBuyValue90d: true, netBuyPct90d: true },
            },
        },
    });
    if (!t) return [];

    const ctx = {
        scores: t.analysisCache,
        metrics: t.finnhubMetrics,
        insider: t.insiderAggregate,
        market: {
            price: t.lastPrice,
            changePct: t.lastChangePct,
            marketCapB: t.lastMarketCap,
        },
    };
    return QUICK_SCREENS
        .filter((s) => matchesPreset(s.preset, ctx))
        .map((s) => ({
            label: s.label,
            ...(s.tip ? { tip: s.tip } : {}),
            href: `/screener?${presetToQueryString(s.preset)}`,
        }));
});
