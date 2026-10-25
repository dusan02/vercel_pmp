import { prisma } from '@/lib/db/prisma';
import { NotificationService } from '../notificationService';
import { applySplitAdjustments, applyPostSplitAdjustment } from '@/lib/utils/splitAdjustment';
import { classifyVerdict } from '@/lib/analysis/verdict';
import { derivePillarInputs, formatPePercentile } from './pillarInputs';

// Re-exported for the consistency tests (moved to pillarInputs).
export { formatPePercentile };

export interface CalculateScoresOptions {
    /** No-op — AI verdict generation was removed (cost vs. value). */
    skipVerdict?: boolean;
    /** Skip quality-breakout notifications (backfills must not spam alerts). */
    skipNotify?: boolean;
}

/**
 * Calculate health, profitability, and valuation scores.
 * Computes Altman Z-Score, Piotroski F-Score, Beneish M-Score, FCF metrics,
 * and generates an AI investment verdict. Persists results to AnalysisCache.
 */
export async function calculateScores(symbol: string, opts: CalculateScoresOptions = {}): Promise<void> {
    // ─── Technical & Price Performance from DailyValuationHistory ─────────
    // Computed even when statements are absent (TSM/ASML/SPY) so technical
    // filters (RSI 14, SMA 20/50/200, Perf 1M/3M/6M/YTD/1Y) cover the full universe.
    const recentPricesDesc = await prisma.dailyValuationHistory.findMany({
        where: { symbol, closePrice: { not: null, gt: 0 } },
        orderBy: { date: 'desc' },
        take: 270,
        select: { date: true, closePrice: true },
    });
    const priceAsc = [...recentPricesDesc].reverse();
    const closes = priceAsc.map(r => r.closePrice!);
    const nPx = closes.length;
    const lastClose = nPx > 0 ? closes[nPx - 1]! : null;

    let rsi14: number | null = null;
    if (nPx >= 15) {
        let avgGain = 0, avgLoss = 0;
        for (let i = 1; i <= 14; i++) {
            const d = closes[i]! - closes[i - 1]!;
            if (d > 0) avgGain += d; else avgLoss -= d;
        }
        avgGain /= 14;
        avgLoss /= 14;
        for (let i = 15; i < nPx; i++) {
            const d = closes[i]! - closes[i - 1]!;
            avgGain = (avgGain * 13 + (d > 0 ? d : 0)) / 14;
            avgLoss = (avgLoss * 13 + (d < 0 ? -d : 0)) / 14;
        }
        rsi14 = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
    }
    const smaDistPct = (k: number): number | null => {
        if (nPx < k || lastClose == null) return null;
        let sum = 0;
        for (let i = nPx - k; i < nPx; i++) sum += closes[i]!;
        const sma = sum / k;
        return sma > 0 ? ((lastClose / sma) - 1) * 100 : null;
    };
    const sma20Pct = smaDistPct(20);
    const sma50Pct = smaDistPct(50);
    const sma200Pct = smaDistPct(200);

    const perfBackPct = (bars: number): number | null => {
        if (nPx <= bars || lastClose == null) return null;
        const base = closes[nPx - 1 - bars]!;
        return base > 0 ? ((lastClose / base) - 1) * 100 : null;
    };
    const perf1m = perfBackPct(21);
    const perf3m = perfBackPct(63);
    const perf6m = perfBackPct(126);
    const perf1y = perfBackPct(252);
    let perfYtd: number | null = null;
    if (nPx >= 2 && lastClose != null) {
        const curYear = priceAsc[nPx - 1]!.date.getUTCFullYear();
        // Last close of prior calendar year (or first close of current year if newly listed)
        let ytdBase: number | null = null;
        for (let i = nPx - 1; i >= 0; i--) {
            if (priceAsc[i]!.date.getUTCFullYear() < curYear) {
                ytdBase = priceAsc[i]!.closePrice!;
                break;
            }
        }
        if (ytdBase == null) {
            const firstCurYear = priceAsc.find(r => r.date.getUTCFullYear() === curYear);
            if (firstCurYear) ytdBase = firstCurYear.closePrice!;
        }
        if (ytdBase != null && ytdBase > 0) perfYtd = ((lastClose / ytdBase) - 1) * 100;
    }

    // Statements bounded to the 10Y window — same scope the read path
    // (computeMetrics) works on, so write-path and read-path derivations see
    // an identical input set.
    const tenYearsAgo = new Date();
    tenYearsAgo.setFullYear(tenYearsAgo.getFullYear() - 10);
    const stmts = await prisma.financialStatement.findMany({
        where: { symbol, endDate: { gte: tenYearsAgo } },
        orderBy: { endDate: 'desc' },
    });

    const latestStmt = stmts[0];
    if (!latestStmt) {
        // No financial statements (foreign ADRs Finnhub doesn't cover — TSM,
        // ASML, BABA...) — a silent return froze the last written score forever
        // (TSM kept healthScore=100 with zero statements). Write an explicit
        // insufficient-data row instead: null scores + fresh updatedAt (while
        // keeping technical price indicators populated).
        await (prisma.analysisCache as any).upsert({
            where: { symbol },
            update: {
                healthScore: null, profitabilityScore: null, valuationScore: null,
                growthScore: null, qualityScore: null, moatScore: null, overallScore: null,
                verdictText: null, piotroskiScore: null, beneishScore: null,
                interestCoverage: null, revenueCagr: null, netIncomeCagr: null,
                altmanZ: null, debtRepaymentYears: null, fcfConversion: null,
                fcfMargin: null, humanDebtInfo: null, humanPeInfo: null,
                marginStability: null, negativeNiYears: null,
                pePercentile: null, peVsMedian3yPct: null,
                fundLevel: null, valLevel: null, verdictKey: 'insufficient',
                roic: null, epsCagr5y: null, priceToCash: null,
                rsi14, sma20Pct, sma50Pct, sma200Pct,
                perf1m, perf3m, perf6m, perfYtd, perf1y,
            },
            create: {
                symbol, verdictKey: 'insufficient',
                rsi14, sma20Pct, sma50Pct, sma200Pct,
                perf1m, perf3m, perf6m, perfYtd, perf1y,
            },
        });
        return;
    }
    const tickerData = await prisma.ticker.findUnique({
        where: { symbol },
        select: { lastPrice: true, lastMarketCap: true, sharesOutstanding: true }
    });

    // Fetch Finnhub pre-computed metrics for scoring
    const finnhubMetrics = await prisma.finnhubMetrics.findUnique({ where: { symbol } });

    // Split-adjust statement share counts exactly like the read path —
    // unadjusted pre-split counts corrupt epsCagr5y (NVDA/GOOGL diverged).
    try {
        await applySplitAdjustments(stmts, symbol, tenYearsAgo);
        applyPostSplitAdjustment(stmts, tickerData?.sharesOutstanding ?? null);
    } catch { /* non-critical — same as read path */ }

    // Full daily valuation history (asc) — the read path's identical fetch;
    // feeds the latest snapshot values and the percentile stats in one query.
    const valuationRows = await prisma.dailyValuationHistory.findMany({
        where: { symbol },
        orderBy: { date: 'asc' },
        select: { date: true, closePrice: true, marketCap: true, peRatio: true, psRatio: true, evEbitda: true, fcfYield: true },
    });

    // ─── Shared derivation (single source for write + read paths) ─────────
    const d = derivePillarInputs({
        stmts,
        tickerData,
        finnhubMetrics,
        valuationRows,
    });
    const pillars = d.pillars;
    const healthScore = pillars.health.score;
    const profitabilityScore = pillars.profitability.score;
    const valuationScore = pillars.valuation.score;
    const growthScore = pillars.growth.score;
    const qualityScore = pillars.quality.score;
    const moatScore = pillars.moat.score;
    const altmanZ = d.altmanZ;
    // Composite = plain mean of the five core 0–100 pillar scores. Distinct from
    // the Early Winners EW score (quant engine, different scale/coverage).
    const overallScore = (healthScore + profitabilityScore + valuationScore + growthScore + qualityScore) / 5;

    // Persisted verdict classification — same shared classifyVerdict the page
    // renders, so screener fund/val/verdict filters match the verdict card
    // exactly (no proxy approximation of the avg-of-4 rule or P/S fallback).
    const vc = classifyVerdict({
        pillars,
        // Read path (analysisCompute) marks tickers whose statements carry no
        // revenue/NI rows as insufficient — same condition so the persisted
        // key can't claim a verdict the page refuses to render.
        insufficientData: d.insufficientData,
        pePercentile: d.pePercentile,
        peCurrent: d.peForPct,
        peMedian: d.peMedian,
        psPercentile: d.psPercentile,
        forwardPe: d.forwardPe,
    });


    // ─── Signal Detection & Notification ───────────────────────────
    let lastQualitySignalAt: Date | undefined;
    if (!opts.skipNotify && altmanZ !== null && altmanZ > 3.0 && healthScore > 80) {
        const existingCache: any = await (prisma.analysisCache as any).findUnique({
            where: { symbol },
            select: { lastQualitySignalAt: true }
        });
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        if (!existingCache?.lastQualitySignalAt || existingCache.lastQualitySignalAt < sevenDaysAgo) {
            lastQualitySignalAt = new Date();
            NotificationService.notifyQualityBreakout(symbol, {
                health: healthScore,
                altmanZ: altmanZ
            }).catch(err => console.error(`[Alert] Notification failed for ${symbol}:`, err));
        }
    }

    // Finviz-style fundamental extras persisted on AnalysisCache:
    // - roic (%): same TTM NOPAT / Invested Capital basis as the Profitability pillar
    // - epsCagr5y (%): 5Y annual EPS CAGR, clamped to [-80, 300]
    // - priceToCash: marketCap / cashAndEquivalents (fallback price / cashPerShare)
    const persistedRoic = d.roic !== null && isFinite(d.roic)
        ? Math.max(-100, Math.min(200, d.roic * 100))
        : null;
    const persistedEpsCagr5y = d.epsCagr5y !== null && isFinite(d.epsCagr5y) && d.epsCagr5y <= 300 && d.epsCagr5y >= -80
        ? d.epsCagr5y
        : null;

    await (prisma.analysisCache as any).upsert({
        where: { symbol },
        update: {
            healthScore, profitabilityScore, valuationScore,
            growthScore, qualityScore, moatScore, overallScore,
            piotroskiScore: d.piotroskiScore, beneishScore: d.beneishScore,
            interestCoverage: d.interestCoverage, revenueCagr: d.revenueCagr,
            netIncomeCagr: d.netIncomeCagr, altmanZ,
            debtRepaymentYears: d.debtRepaymentYears, fcfMargin: d.fcfMargin,
            fcfConversion: d.fcfConversion,
            humanDebtInfo: d.humanDebtInfo, humanPeInfo: d.humanPeInfo,
            marginStability: d.marginStability, negativeNiYears: d.negativeNiYears,
            pePercentile: d.pePercentile, peVsMedian3yPct: d.peVsMedian3yPct,
            fundLevel: vc.fundLevel, valLevel: vc.valLevel, verdictKey: vc.verdictKey,
            roic: persistedRoic, epsCagr5y: persistedEpsCagr5y, priceToCash: d.priceToCash,
            rsi14, sma20Pct, sma50Pct, sma200Pct,
            perf1m, perf3m, perf6m, perfYtd, perf1y,
            ...(lastQualitySignalAt ? { lastQualitySignalAt } : {})
        },
        create: {
            symbol, healthScore, profitabilityScore, valuationScore,
            growthScore, qualityScore, moatScore, overallScore,
            piotroskiScore: d.piotroskiScore, beneishScore: d.beneishScore,
            interestCoverage: d.interestCoverage, revenueCagr: d.revenueCagr,
            netIncomeCagr: d.netIncomeCagr, altmanZ,
            debtRepaymentYears: d.debtRepaymentYears, fcfMargin: d.fcfMargin,
            fcfConversion: d.fcfConversion,
            humanDebtInfo: d.humanDebtInfo, humanPeInfo: d.humanPeInfo,
            marginStability: d.marginStability, negativeNiYears: d.negativeNiYears,
            pePercentile: d.pePercentile, peVsMedian3yPct: d.peVsMedian3yPct,
            lastQualitySignalAt,
            fundLevel: vc.fundLevel, valLevel: vc.valLevel, verdictKey: vc.verdictKey,
            roic: persistedRoic, epsCagr5y: persistedEpsCagr5y, priceToCash: d.priceToCash,
            rsi14, sma20Pct, sma50Pct, sma200Pct,
            perf1m, perf3m, perf6m, perfYtd, perf1y,
        }
    });
}
