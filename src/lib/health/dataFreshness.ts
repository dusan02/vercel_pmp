/**
 * Data-freshness evaluator for the /api/health/data endpoint.
 *
 * Pure logic — the route collects DB counts and hands them here so the
 * thresholds are unit-testable without a database. Background: mid-week the
 * newest trading day reached only ~2% coverage in DailyValuationHistory
 * (lazy per-ticker syncs only) and the incident was invisible for days.
 */
import { getTradingDay, getLastTradingDay } from '@/lib/utils/timeUtils';
import { minutesSinceMidnightET, isSameETDay } from '@/lib/utils/dateET';

/**
 * The post-market reset (saveRegularClose + valuation fill) lands ~16:20 ET.
 * Before this cutoff on a trading day we still expect the *previous* session.
 */
const POST_CLOSE_CUTOFF_MIN = 17 * 60 + 30;

export type HealthLevel = 'healthy' | 'degraded' | 'unhealthy';
export type CheckLevel = 'ok' | 'warn' | 'fail';

export interface FreshnessCheck {
    name: string;
    status: CheckLevel;
    detail: string;
}

export interface FreshnessSnapshot {
    /** Expected completed session (ET-midnight instant, as stored in DailyRef.date). */
    expectedSessionDate: string;
    dailyRefRows: number;
    dailyRefWithClose: number;
    valuationRows: number;
    tickerTotal: number;
    tickerStalePrices: number;
    analysisCacheTotal: number;
    analysisCacheStale7d: number;
}

export function getExpectedCompletedSession(now: Date): Date {
    const tradingDay = getTradingDay(now);
    if (isSameETDay(tradingDay, now) && minutesSinceMidnightET(now) < POST_CLOSE_CUTOFF_MIN) {
        return getLastTradingDay(now);
    }
    return tradingDay;
}

export function evaluateDataFreshness(s: FreshnessSnapshot): { status: HealthLevel; checks: FreshnessCheck[] } {
    const checks: FreshnessCheck[] = [];

    // DailyRef: a row set must exist for the expected session, and nearly all
    // rows should have an official close (baseline ~0.8% nulls = delisted).
    if (s.dailyRefRows === 0) {
        checks.push({ name: 'dailyRef.rows', status: 'fail', detail: `0 rows for ${s.expectedSessionDate} — post-market reset did not run` });
    } else {
        const universeRatio = s.tickerTotal > 0 ? s.dailyRefRows / s.tickerTotal : 0;
        checks.push({
            name: 'dailyRef.rows',
            status: universeRatio < 0.5 ? 'fail' : universeRatio < 0.9 ? 'warn' : 'ok',
            detail: `${s.dailyRefRows} rows (${(universeRatio * 100).toFixed(0)}% of ${s.tickerTotal} tickers)`,
        });
        const closeCoverage = s.dailyRefWithClose / s.dailyRefRows;
        checks.push({
            name: 'dailyRef.regularClose',
            status: closeCoverage < 0.8 ? 'fail' : closeCoverage < 0.95 ? 'warn' : 'ok',
            detail: `${s.dailyRefWithClose}/${s.dailyRefRows} closes (${(closeCoverage * 100).toFixed(1)}%)`,
        });
    }

    // Valuation: newest trading day should be filled by the daily fill step.
    // The incident that motivated this: 16/995 = 1.6% coverage on 2026-09-28.
    if (s.dailyRefWithClose > 0) {
        const valCoverage = s.valuationRows / s.dailyRefWithClose;
        checks.push({
            name: 'valuation.coverage',
            status: valCoverage < 0.5 ? 'fail' : valCoverage < 0.9 ? 'warn' : 'ok',
            detail: `${s.valuationRows}/${s.dailyRefWithClose} rows (${(valCoverage * 100).toFixed(1)}%)`,
        });
    }

    // Ticker prices: baseline ~6 dead symbols (universe-expansion stragglers).
    checks.push({
        name: 'ticker.stalePrices',
        status: s.tickerStalePrices > 50 ? 'fail' : s.tickerStalePrices > 15 ? 'warn' : 'ok',
        detail: `${s.tickerStalePrices} tickers with null/stale >24h price`,
    });

    // AnalysisCache: baseline ~6% stale >7d (ADR tickers without fundamentals).
    const staleRatio = s.analysisCacheTotal > 0 ? s.analysisCacheStale7d / s.analysisCacheTotal : 0;
    checks.push({
        name: 'analysisCache.stale7d',
        status: staleRatio > 0.4 ? 'fail' : staleRatio > 0.15 ? 'warn' : 'ok',
        detail: `${s.analysisCacheStale7d}/${s.analysisCacheTotal} stale >7d (${(staleRatio * 100).toFixed(1)}%)`,
    });

    const status: HealthLevel = checks.some(c => c.status === 'fail')
        ? 'unhealthy'
        : checks.some(c => c.status === 'warn') ? 'degraded' : 'healthy';

    return { status, checks };
}
