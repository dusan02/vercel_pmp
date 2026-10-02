import { downsampleSeries, METRIC_FILTERS, MARKET_RANGE_FILTERS } from '@/lib/utils/screener';

describe('downsampleSeries (screener 1Y sparkline)', () => {
    it('returns a copy of short series unchanged', () => {
        const src = [10, 11, 12, 13];
        const out = downsampleSeries(src);
        expect(out).toEqual(src);
        expect(out).not.toBe(src); // copy, not the same reference
    });

    it('handles empty and single-point series', () => {
        expect(downsampleSeries([])).toEqual([]);
        expect(downsampleSeries([42])).toEqual([42]);
    });

    it('caps output at ~maxPoints and keeps endpoints', () => {
        const daily = Array.from({ length: 252 }, (_, i) => 100 + i); // 1Y trading days
        const out = downsampleSeries(daily, 52);
        expect(out.length).toBeLessThanOrEqual(53); // stride pts + appended last
        expect(out[0]).toBe(100); // first close kept
        expect(out[out.length - 1]).toBe(351); // last close always appended
    });

    it('is monotonic on a monotonic input', () => {
        const daily = Array.from({ length: 500 }, (_, i) => Math.sin(i / 10) * 50 + 200);
        const out = downsampleSeries(daily, 52);
        expect(out.length).toBeGreaterThan(40);
        expect(out.length).toBeLessThanOrEqual(53);
    });

    it('exact-boundary series (n = maxPoints) stays untouched', () => {
        const exact = Array.from({ length: 52 }, (_, i) => i);
        expect(downsampleSeries(exact, 52)).toEqual(exact);
    });
});

describe('screener filter param conventions', () => {
    it('metric + market filter keys produce unique API param names', () => {
        const all = [...MARKET_RANGE_FILTERS, ...METRIC_FILTERS];
        const params = all.flatMap((d) => {
            const cap = d.key[0]!.toUpperCase() + d.key.slice(1);
            return [`min${cap}`, `max${cap}`];
        });
        expect(new Set(params).size).toBe(params.length);
        // Market filters must map onto the Ticker-side params the API reads.
        expect(params).toContain('minPrice');
        expect(params).toContain('maxChangePct');
        // No key may collide with a FinnhubMetrics field name.
        expect(MARKET_RANGE_FILTERS.map(d => d.key)).not.toContain('roe');
    });
});
