import { evaluateDataFreshness, getExpectedCompletedSession, FreshnessSnapshot } from '@/lib/health/dataFreshness';
import { getDateET } from '@/lib/utils/dateET';

// 2026-09-28 was a Monday; Sep 26/27 weekend; Sep 25 Friday.
const healthySnapshot: FreshnessSnapshot = {
    expectedSessionDate: '2026-09-28',
    dailyRefRows: 997,
    dailyRefWithClose: 989,
    valuationRows: 995,
    tickerTotal: 1003,
    tickerStalePrices: 6,
    analysisCacheTotal: 984,
    analysisCacheStale7d: 59,
};

describe('getExpectedCompletedSession', () => {
    it('returns Friday on the weekend', () => {
        expect(getDateET(getExpectedCompletedSession(new Date('2026-09-26T16:00:00Z')))).toBe('2026-09-25'); // Sat noon ET
        expect(getDateET(getExpectedCompletedSession(new Date('2026-09-27T20:00:00Z')))).toBe('2026-09-25'); // Sun afternoon ET
    });

    it('returns previous trading day mid-session Monday (close not final yet)', () => {
        expect(getDateET(getExpectedCompletedSession(new Date('2026-09-28T14:00:00Z')))).toBe('2026-09-25'); // 10:00 ET
    });

    it('returns same day after the post-close cutoff', () => {
        expect(getDateET(getExpectedCompletedSession(new Date('2026-09-28T22:30:00Z')))).toBe('2026-09-28'); // 18:30 ET
    });

    it('returns Monday on Tuesday morning', () => {
        expect(getDateET(getExpectedCompletedSession(new Date('2026-09-29T16:00:00Z')))).toBe('2026-09-28'); // Tue noon ET
    });

    it('skips market holidays (Jul 3 2026 = observed July 4th, Friday)', () => {
        // Friday Jul 3 2026 is the observed holiday → last completed session is Thu Jul 2
        expect(getDateET(getExpectedCompletedSession(new Date('2026-07-03T20:00:00Z')))).toBe('2026-07-02');
    });
});

describe('evaluateDataFreshness', () => {
    it('healthy baseline passes all checks', () => {
        const r = evaluateDataFreshness(healthySnapshot);
        expect(r.status).toBe('healthy');
        expect(r.checks.every(c => c.status === 'ok')).toBe(true);
    });

    it('fails when the newest session has almost no valuation rows (the 2026-09-28 incident)', () => {
        const r = evaluateDataFreshness({ ...healthySnapshot, valuationRows: 16 });
        expect(r.status).toBe('unhealthy');
        expect(r.checks.find(c => c.name === 'valuation.coverage')?.status).toBe('fail');
    });

    it('fails when DailyRef has no rows at all for the expected session', () => {
        const r = evaluateDataFreshness({ ...healthySnapshot, dailyRefRows: 0, dailyRefWithClose: 0, valuationRows: 0 });
        expect(r.status).toBe('unhealthy');
        expect(r.checks.find(c => c.name === 'dailyRef.rows')?.status).toBe('fail');
    });

    it('warns on partial valuation coverage without failing', () => {
        const r = evaluateDataFreshness({ ...healthySnapshot, valuationRows: 700 }); // ~71%
        expect(r.status).toBe('degraded');
        expect(r.checks.find(c => c.name === 'valuation.coverage')?.status).toBe('warn');
    });

    it('warns when dead tickers grow beyond baseline', () => {
        const r = evaluateDataFreshness({ ...healthySnapshot, tickerStalePrices: 20 });
        expect(r.status).toBe('degraded');
    });

    it('fails when AnalysisCache broadly rots', () => {
        const r = evaluateDataFreshness({ ...healthySnapshot, analysisCacheStale7d: 500 });
        expect(r.status).toBe('unhealthy');
    });
});
