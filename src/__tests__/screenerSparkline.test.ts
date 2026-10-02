import { downsampleSeries, METRIC_FILTERS, METRIC_GROUPS, MARKET_RANGE_FILTERS, INSIDER_RANGE_FILTERS, RANGE_FILTERS, QUICK_SCREENS, presetToQueryString, isValidScreenParams } from '@/lib/utils/screener';
import { LEADERBOARDS } from '@/lib/seo/leaderboards';

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
    it('all registry keys produce unique API param names', () => {
        const params = RANGE_FILTERS.flatMap((d) => {
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

    it('registry covers market + metric + insider arrays exactly once', () => {
        const all = [...MARKET_RANGE_FILTERS, ...METRIC_FILTERS, ...INSIDER_RANGE_FILTERS];
        expect(RANGE_FILTERS.length).toBe(all.length);
        for (const d of all) {
            expect(RANGE_FILTERS.filter((r) => r.key === d.key).length).toBe(1);
        }
    });

    it('ticker-source defs map to real Ticker columns', () => {
        const ticker = RANGE_FILTERS.filter((d) => d.source === 'ticker');
        expect(ticker.map((d) => d.field).sort()).toEqual(['lastChangePct', 'lastPrice']);
    });
});

describe('QUICK_SCREENS presets', () => {
    it('every preset range references a valid registry key', () => {
        const valid = new Set(RANGE_FILTERS.map((d) => d.key));
        for (const s of QUICK_SCREENS) {
            for (const key of Object.keys(s.preset.ranges ?? {})) {
                expect(valid.has(key as never)).toBe(true);
            }
        }
    });

    it('preset sort fields follow the <field>:<asc|desc> convention', () => {
        for (const s of QUICK_SCREENS) {
            if (!s.preset.sort) continue;
            expect(s.preset.sort).toMatch(/^[a-zA-Z0-9.]+:(asc|desc)$/);
        }
    });

    it('valuation ratios in presets always have a positive floor', () => {
        // P/E, P/B, PEG, EV/EBITDA, P/FCF are meaningless when negative —
        // a preset must never admit loss-makers through a missing min bound.
        const ratioKeys = new Set(['peRatio', 'forwardPe', 'pbRatio', 'pegRatio', 'evEbitda', 'priceFreeCashFlow']);
        for (const s of QUICK_SCREENS) {
            for (const [key, r] of Object.entries(s.preset.ranges ?? {})) {
                if (!ratioKeys.has(key) || !r) continue;
                expect(r.min ?? -Infinity).toBeGreaterThan(0);
            }
        }
    });

    it('every preset group is declared and both groups are used', () => {
        const groups = new Set(QUICK_SCREENS.map((s) => s.group));
        expect(groups).toEqual(new Set(['score', 'strategy']));
    });

    it('presetToQueryString produces only whitelisted params (round-trip safe)', () => {
        for (const s of QUICK_SCREENS) {
            const qs = presetToQueryString(s.preset);
            expect(isValidScreenParams(qs)).toBe(true);
        }
    });
});

describe('isValidScreenParams (saved screens)', () => {
    it('accepts a typical serialized filter set', () => {
        expect(isValidScreenParams('minRoe=15&maxPeRatio=15&sector=Technology&sort=metrics.roe:desc&q=AA')).toBe(true);
    });

    it('rejects unknown params', () => {
        expect(isValidScreenParams('evilParam=1')).toBe(false);
        expect(isValidScreenParams('minRoe=15&__proto__=x')).toBe(false);
    });

    it('rejects non-finite metric values', () => {
        expect(isValidScreenParams('minRoe=abc')).toBe(false);
        expect(isValidScreenParams('minRoe=')).toBe(false);
        expect(isValidScreenParams('maxPeRatio=Infinity')).toBe(false);
    });

    it('rejects malformed sort values', () => {
        expect(isValidScreenParams('sort=roe')).toBe(false);
        expect(isValidScreenParams('sort=a:b:c')).toBe(false);
        expect(isValidScreenParams('sort=metrics.roe:desc')).toBe(true);
    });

    it('rejects empty and oversized payloads', () => {
        expect(isValidScreenParams('')).toBe(false);
        expect(isValidScreenParams('q=' + 'x'.repeat(200))).toBe(false);
        expect(isValidScreenParams('minRoe=15&'.repeat(400) + 'a=1')).toBe(false);
    });
});

describe('leaderboard preset mirrors', () => {
    const presetLeaderboards = LEADERBOARDS.filter((l) => l.screenerParams);

    it('each strategy leaderboard deep-links to a valid screener state', () => {
        for (const l of presetLeaderboards) {
            expect(isValidScreenParams(l.screenerParams!)).toBe(true);
        }
    });

    it('slug set is unique', () => {
        const slugs = LEADERBOARDS.map((l) => l.slug);
        expect(new Set(slugs).size).toBe(slugs.length);
    });

    it('cross-relation screens declare extraTickerWhere, not same-relation extras', () => {
        // Turnarounds: metric = insiderAggregate, fundamentals live on the
        // ticker-level where — the two must not collide on one relation.
        const t = LEADERBOARDS.find((l) => l.slug === 'turnaround-stocks');
        expect(t).toBeDefined();
        expect(t!.source).toBe('insiderAggregate');
        expect(t!.extraTickerWhere?.finnhubMetrics).toBeDefined();
    });
});

describe('METRIC_GROUPS', () => {
    it('covers every metric filter exactly once, in order', () => {
        const grouped = METRIC_GROUPS.flatMap((g) => METRIC_FILTERS.filter((d) => d.group === g));
        expect(grouped.map((d) => d.key)).toEqual(METRIC_FILTERS.map((d) => d.key));
    });
});
