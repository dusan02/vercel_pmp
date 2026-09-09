import { PitDatabase } from '../pit-db/index.js';
import { TemporalSnapshot } from './temporal-snapshot.js';
import { PitFundamental, MarketBar, PitEstimate, Instant } from './temporal-types.js';
import { PitReconstructor } from './db/PitReconstructor.js';
import { CorporateActionAdjuster, CorporateActionInput } from './ca-adjustment.js';
import type { PrismaClient } from './db/client';

/**
 * PitDataLoader — loads PIT-correct data for feature extraction.
 *
 * Fundamentals and estimates come from the SQLite PitDatabase (test harness).
 * Prices come from PitPriceFact via PitReconstructor (production PIT path)
 * when a PrismaClient is provided. Falls back to SQLite MarketBars for
 * backward compatibility with existing test scripts.
 *
 * Key fixes (3P.3 audit):
 * - Uses PitReconstructor.getPrices() with PIT semantics (availableAt/supersededAt)
 * - Uses securityId instead of ticker for PIT-correct identity
 * - Sets volume from PitPriceFact (not hardcoded 0)
 * - Gets benchmark (SPY) via PitReconstructor using SPY's securityId
 * - Applies corporate action adjustment to prices
 * - Handles missing prices gracefully (returns empty array, not error)
 */
export class PitDataLoader {
    private prisma: PrismaClient | null = null;
    private reconstructor: PitReconstructor | null = null;
    private spySecurityId: string | null = null;

    constructor(private db: PitDatabase, prisma?: PrismaClient) {
        if (prisma) {
            this.prisma = prisma;
            this.reconstructor = new PitReconstructor(prisma);
        }
    }

    /**
     * Resolves a ticker to its securityId via PitTickerHistory.
     * Returns null if not found.
     */
    private async resolveSecurityId(ticker: string): Promise<string | null> {
        if (!this.prisma) return null;

        const tickerHistory = await this.prisma.pitTickerHistory.findFirst({
            where: { ticker },
            orderBy: { startDate: 'desc' },
        });

        return tickerHistory?.securityId ?? null;
    }

    /**
     * Finds the SPY benchmark securityId, caching it for reuse.
     */
    private async getSpySecurityId(): Promise<string | null> {
        if (this.spySecurityId !== null) return this.spySecurityId;
        if (!this.prisma) return null;

        this.spySecurityId = await this.resolveSecurityId('SPY');
        return this.spySecurityId;
    }

    /**
     * Loads corporate actions for a security as-of the observation time.
     * Only returns actions that were KNOWN (availableAt <= observationTime
     * and supersededAt > observationTime).
     */
    private async loadCorporateActions(securityId: string, observationTime: Date): Promise<CorporateActionInput[]> {
        if (!this.prisma) return [];

        const actions = await this.prisma.pitCorporateAction.findMany({
            where: {
                securityId,
                availableAt: { lte: observationTime },
                supersededAt: { gt: observationTime },
            },
            orderBy: { effectiveDate: 'asc' },
        });

        return actions.map(a => ({
            type: a.actionType as 'SPLIT' | 'DIVIDEND',
            effectiveDate: a.effectiveDate,
            splitFactor: a.splitFactor,
            dividendAmount: a.dividendAmount,
        }));
    }

    /**
     * Loads PIT-correct prices for a security via PitReconstructor.
     * Applies corporate action adjustment.
     * Returns MarketBar[] sorted by date DESC (latest first, matching original convention).
     */
    private async loadPitPrices(
        ticker: string,
        securityId: string,
        startDate: Date,
        observationTime: Date
    ): Promise<MarketBar[]> {
        if (!this.reconstructor) return [];

        // Query PitPriceFact with PIT semantics
        const priceFacts = await this.reconstructor.getPrices(
            securityId,
            observationTime,
            observationTime  // maxTradeDate = observationTime (don't look into future)
        );

        if (priceFacts.length === 0) return [];

        // Filter to the 6-month window
        const filtered = priceFacts.filter(p => p.tradeDate >= startDate);

        // Load corporate actions for CA adjustment
        const actions = await this.loadCorporateActions(securityId, observationTime);

        // Build close-on-action-date map for dividend adjustment
        const closeOnActionDate = new Map<string, number>();
        for (const p of filtered) {
            const dateKey = p.tradeDate.toISOString().split('T')[0];
            closeOnActionDate.set(dateKey, p.close);
        }

        // Map to MarketBar format with CA adjustment
        const marketBars: MarketBar[] = filtered.map(p => {
            const factor = CorporateActionAdjuster.computeAdjustmentFactor(
                p.tradeDate,
                actions,
                closeOnActionDate
            );

            const dateStr = p.tradeDate.toISOString();

            return {
                ticker,
                date: dateStr,
                startTime: dateStr,
                endTime: dateStr,
                open: p.open * factor,
                high: p.high * factor,
                low: p.low * factor,
                close: p.close * factor,
                volume: Number(p.volume),
                classification: "VALID" as const,
            };
        });

        // Sort by date DESC (latest first, matching original convention)
        marketBars.sort((a, b) => b.date.localeCompare(a.date));

        return marketBars;
    }

    async loadSnapshot(
        cik: string,
        ticker: string,
        targetPeriodEnd: string,
        observationTime: Instant
    ): Promise<TemporalSnapshot> {

        const fundamentals: PitFundamental[] = [];
        const rows = await this.db.getAllFundamentalsAsKnownAt(
            cik,
            ["Revenues", "OperatingIncomeLoss", "EarningsPerShareBasic"],
            observationTime
        );
        for (const raw of rows) {
            fundamentals.push({
                cik, metric: raw.metricName, economicPeriodEnd: raw.economicPeriodEnd,
                acceptanceDateTime: raw.acceptanceDateTime, accessionNumber: raw.accessionNumber,
                contextRef: raw.contextRef, value: raw.value
            });
        }

        const estimates: PitEstimate[] = [];
        const estRows = await this.db.getEstimatesAsKnownAt(cik, "EPS", targetPeriodEnd, observationTime);
        for (const raw of estRows) {
            estimates.push({
                cik, metricName: raw.metricName, fiscalPeriod: raw.fiscalPeriod,
                consensusValue: raw.consensusValue, knownAt: raw.knownAt
            });
        }

        // Compute 6-month lookback window
        const sixMonthsAgo = new Date(observationTime);
        sixMonthsAgo.setUTCMonth(sixMonthsAgo.getUTCMonth() - 6); sixMonthsAgo.setUTCHours(0,0,0,0);
        const startDate = sixMonthsAgo.toISOString();
        const obsDate = new Date(observationTime);

        // Load prices: use PitReconstructor if PrismaClient is available,
        // otherwise fall back to SQLite MarketBars (backward compat)
        let marketBars: MarketBar[] = [];
        let benchmarkBars: MarketBar[] = [];

        if (this.reconstructor && this.prisma) {
            // --- PIT-correct path via PitReconstructor ---

            // Resolve securityId for the stock
            const securityId = await this.resolveSecurityId(ticker);
            if (securityId) {
                marketBars = await this.loadPitPrices(ticker, securityId, sixMonthsAgo, obsDate);
            } else {
                console.warn(`[PitDataLoader] No securityId found for ticker ${ticker}, prices will be empty`);
            }

            // Resolve SPY securityId for benchmark
            const spySecurityId = await this.getSpySecurityId();
            if (spySecurityId) {
                benchmarkBars = await this.loadPitPrices('SPY', spySecurityId, sixMonthsAgo, obsDate);
            } else {
                console.warn('[PitDataLoader] No SPY securityId found, benchmark will be empty');
            }
        } else {
            // --- Fallback path via SQLite MarketBars (backward compat) ---

            const barRows = await this.db.getMarketBarsInRange(ticker, startDate, observationTime);
            marketBars = barRows.map(r => ({
                ticker: r.ticker, date: r.date, startTime: r.date, endTime: r.date,
                open: r.close, high: r.close, low: r.close, close: r.close, volume: 0, classification: "VALID"
            }));

            const benchRows = await this.db.getMarketBarsInRange("SPY", startDate, observationTime);
            benchmarkBars = benchRows.map(r => ({
                ticker: r.ticker, date: r.date, startTime: r.date, endTime: r.date,
                open: r.close, high: r.close, low: r.close, close: r.close, volume: 0, classification: "VALID"
            }));
        }

        return new TemporalSnapshot(cik, ticker, observationTime, fundamentals, estimates, marketBars, benchmarkBars);
    }
}
