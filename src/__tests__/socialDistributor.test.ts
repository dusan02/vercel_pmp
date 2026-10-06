/**
 * @jest-environment node
 *
 * Social distribution review fixes:
 *   - patchSocialCopy: live % + direction emoji + RVOL/Z-score token refresh
 *   - extractCatalyst: quant/filler fragments ("0.1x relative volume",
 *     "statistical outlier") are measurement descriptions, not catalysts
 *   - inPostingWindow: PM2 bootstrap fires must not post mislabeled digests
 *   - bskyFitText: Bluesky 300-grapheme cap (no t.co shortening) — URL lines
 *     dropped first because the embed card carries the click target
 */
import { SocialDistributorService } from '@/services/socialDistributorService';
import { prisma } from '@/lib/db/prisma';

jest.mock('@/lib/db/prisma', () => ({
    prisma: {
        ticker: { findMany: jest.fn().mockResolvedValue([]) },
        dailyBlogSnapshot: { findUnique: jest.fn().mockResolvedValue(null) },
    },
}));

let etNow = { year: 2026, month: 10, day: 6, hour: 8, minute: 45, second: 0, weekday: 1 };
jest.mock('@/lib/utils/dateET', () => ({
    getDateET: jest.fn(() => '2026-10-06'),
    toET: jest.fn(() => etNow),
}));

const redisStore = new Map<string, string>();
jest.mock('@/lib/redis', () => ({
    redisClient: {
        isOpen: true,
        get: jest.fn(async (k: string) => redisStore.get(k) ?? null),
        set: jest.fn(async (k: string, v: string) => { redisStore.set(k, v); return 'OK'; }),
        incr: jest.fn(async (k: string) => {
            const n = (parseInt(redisStore.get(k) ?? '0', 10) || 0) + 1;
            redisStore.set(k, String(n));
            return n;
        }),
        expire: jest.fn(async () => true),
    },
}));

const service = new SocialDistributorService();
const svc = service as any;
const ticker = (prisma as any).ticker;

const mv = (o: any) => ({ lastChangePct: null, latestMoversRVOL: null, latestMoversZScore: null, ...o });

beforeEach(() => {
    jest.clearAllMocks();
    redisStore.clear();
    etNow = { year: 2026, month: 10, day: 6, hour: 8, minute: 45, second: 0, weekday: 1 };
    delete process.env.BUFFER_ACCESS_TOKEN;
    delete process.env.BLUESKY_HANDLE;
    delete process.env.BLUESKY_APP_PASSWORD;
    delete process.env.TWITTER_API_KEY;
    delete process.env.TWITTER_API_SECRET;
    delete process.env.TWITTER_ACCESS_TOKEN;
    delete process.env.TWITTER_ACCESS_SECRET;
});

describe('patchSocialCopy', () => {
    it('patches % and flips the direction emoji to the live sign', () => {
        const out = svc.patchSocialCopy('📈 $AMIX +2.00% surging on news', mv({ lastChangePct: -6.12 }));
        expect(out).toBe('📉 $AMIX -6.12% surging on news');
    });

    it('swaps the mid-string direction emoji in legacy 👀 copy', () => {
        const out = svc.patchSocialCopy('👀 $MOD 📉 -11.53% on 4x relative volume.', mv({ lastChangePct: 5.5 }));
        expect(out).toContain('📈');
        expect(out).toContain('+5.50%');
        expect(out).not.toContain('📉');
    });

    it('prepends a direction emoji when copy has none', () => {
        const out = svc.patchSocialCopy('$X -3.00% moves lower', mv({ lastChangePct: -3 }));
        expect(out).toMatch(/^📉 /);
    });

    it('patches RVOL/Z-score tokens to live values and normalizes casing', () => {
        const out = svc.patchSocialCopy(
            '📈 $CEG +6.60% on deal talks | RVOL: 9x | Z-Score 0.44σ | #CEG',
            mv({ latestMoversRVOL: 2.14, latestMoversZScore: 2.636 })
        );
        expect(out).toContain('RVOL 2.1x');
        expect(out).toContain('Z-score 2.64σ');
        expect(out).not.toContain('Z-Score');
        expect(out).not.toContain('9x');
    });
});

describe('extractCatalyst', () => {
    const mover = (socialCopy: string, reason = '', rvol: number | null = null) =>
        ({ symbol: 'CHRW', socialCopy, moversReason: reason, latestMoversRVOL: rvol, latestMoversZScore: null });

    it('keeps a real catalyst', () => {
        const s = svc.extractCatalyst(mover('📉 $CHRW -12.60% on $23.7B acquisition by Schneider…'));
        expect(s.toLowerCase()).toContain('acquisition');
    });

    it('drops pure quant fragments — "0.1x relative volume"', () => {
        expect(svc.extractCatalyst(mover('📉 $CHRW -12.60% on 0.1x relative volume. Statistical…', '', 0.1))).toBe('');
    });

    it('drops filler-volatility copy — "surging on extreme volatility"', () => {
        expect(svc.extractCatalyst(mover('📈 $XP +33.0% surging on extreme volatility!', '', 0.8))).toBe('');
    });

    it('rejects quant moversReason, falls back to unusual volume only when RVOL>=2', () => {
        expect(svc.extractCatalyst(mover('', 'Extreme upward move (Z: 5.1) with no public news catalyst', 4.2))).toBe('unusual volume');
        expect(svc.extractCatalyst(mover('', '', 1.5))).toBe('');
    });

    it('keeps substantive moversReason, word-boundary truncated at ~42 chars', () => {
        const s = svc.extractCatalyst(mover('', 'Brazilian election rally drives banking sector higher', null));
        expect(s).toContain('Brazilian election rally');
        expect(s.endsWith('…')).toBe(true);
    });
});

describe('bskyFitText', () => {
    it('leaves short text unchanged', () => {
        const t = '📈 $CEG +6.60% on deal talks\n\nFull breakdown: https://premarketprice.com/analysis/CEG';
        expect(svc.bskyFitText(t)).toBe(t);
    });

    it('strips URL lines when over 300 graphemes (card carries the link)', () => {
        const digest = [
            '🔔 Before the open:', '',
            '📈 $PTC +33.8% — on $23.7B acquisition by Schneider…',
            '📈 $XP +33.0% — surging on extreme volatility!',
            '📈 $ITUB +16.1% — on Brazilian election rally.',
            '📉 $CHRW -12.6% — on 0.1x relative volume. Statistical…', '',
            'Watch the open → https://premarketprice.com/premarket-movers?utm_source=bluesky&utm_medium=social&utm_campaign=movers',
        ].join('\n');
        expect(digest.length).toBeGreaterThan(300);
        const out = svc.bskyFitText(digest);
        expect(out).not.toContain('http');
        expect(out).toContain('Before the open');
        expect(out).toContain('$PTC');
        expect(svc.graphemeLength(out)).toBeLessThanOrEqual(300);
    });

    it('word-boundary truncates when still over after URL strip', () => {
        const t = 'word '.repeat(80).trim(); // 399 chars, no URLs
        const out = svc.bskyFitText(t);
        expect(svc.graphemeLength(out)).toBeLessThanOrEqual(300);
        expect(out.endsWith('…')).toBe(true);
    });
});

describe('posting window guard', () => {
    it('skips recap digest fired mid-session (PM2 bootstrap)', async () => {
        etNow = { ...etNow, hour: 13, minute: 30 };
        const res = await service.postDailyRecap();
        expect(res.posted).toEqual([]);
        expect(ticker.findMany).not.toHaveBeenCalled();
    });

    it('skips recap digest fired pre-open', async () => {
        etNow = { ...etNow, hour: 8, minute: 45 };
        await service.postDailyRecap();
        expect(ticker.findMany).not.toHaveBeenCalled();
    });

    it('skips digests on weekends', async () => {
        etNow = { ...etNow, hour: 16, minute: 5, weekday: 0 };
        await service.postDailyRecap();
        expect(ticker.findMany).not.toHaveBeenCalled();
    });

    it('force bypasses the window but not the daily lock', async () => {
        etNow = { ...etNow, hour: 13, minute: 30 };
        redisStore.set('social:recap:2026-10-06', '1');
        const res = await service.postDailyRecap({ force: true });
        expect(res.posted).toEqual([]);
        expect(ticker.findMany).not.toHaveBeenCalled(); // lock check precedes the query
    });

    it('skips singles distribution outside 06:30–17:30 ET', async () => {
        etNow = { ...etNow, hour: 20, minute: 0 };
        const res = await service.distributeTopMovers();
        expect(res.posted).toEqual([]);
        expect(ticker.findMany).not.toHaveBeenCalled();
    });
});

describe('digest end-to-end (Bluesky only)', () => {
    let captured: any;
    const fetchMock = jest.fn(async (url: string, init: any) => {
        if (url.includes('createSession')) return { ok: true, json: async () => ({ accessJwt: 'j', did: 'did:x' }) } as any;
        if (url.includes('opengraph-image')) return { ok: true, arrayBuffer: async () => new Uint8Array(64).buffer } as any;
        if (url.includes('uploadBlob')) return { ok: true, json: async () => ({ blob: { ref: 'b' } }) } as any;
        if (url.includes('createRecord')) { captured = JSON.parse(init.body); return { ok: true, json: async () => ({}) } as any; }
        throw new Error('unmocked fetch: ' + url);
    });

    it('digest fits Bluesky and the card links to the movers board', async () => {
        process.env.BLUESKY_HANDLE = 'h';
        process.env.BLUESKY_APP_PASSWORD = 'p';
        (global as any).fetch = fetchMock;
        // A blog snapshot exists → digest gains a second URL line, pushing
        // the text past 300 graphemes (the Oct-5 production failure shape).
        (prisma as any).dailyBlogSnapshot.findUnique.mockResolvedValue({ date: '2026-10-06' });
        ticker.findMany
            .mockResolvedValueOnce([
                { symbol: 'PTC', name: 'PTC Inc', lastPrice: 200, lastChangePct: 33.8, socialCopy: '📈 $PTC +33.8% on $23.7B acquisition by Schneider Electric', moversReason: null, latestMoversRVOL: 5, latestMoversZScore: 9 },
                { symbol: 'XP', name: 'XP Inc', lastPrice: 20, lastChangePct: 33.0, socialCopy: '📈 $XP +33.0% on surging volumes across Brazilian brokerages', moversReason: null, latestMoversRVOL: 0.8, latestMoversZScore: 6.5 },
                { symbol: 'ITUB', name: 'Itau', lastPrice: 8, lastChangePct: 16.1, socialCopy: '📈 $ITUB +16.1% on Brazilian election rally in banks', moversReason: null, latestMoversRVOL: 3, latestMoversZScore: 5 },
            ])
            .mockResolvedValueOnce([
                { symbol: 'CHRW', name: 'CH Robinson', lastPrice: 100, lastChangePct: -12.6, socialCopy: '📉 $CHRW -12.6% on 0.1x relative volume. Statistical…', moversReason: null, latestMoversRVOL: 0.1, latestMoversZScore: -5 },
            ]);
        etNow = { ...etNow, hour: 16, minute: 5 };
        const res = await service.postDailyRecap();
        expect(res.posted).toEqual(['PTC', 'XP', 'ITUB', 'CHRW']);

        const text: string = captured.record.text;
        expect(svc.graphemeLength(text)).toBeLessThanOrEqual(300);
        expect(text).not.toContain('http');
        expect(text).toContain("Today's biggest movers");
        expect(text).not.toContain('0.1x relative volume'); // quant catalyst filtered
        expect(captured.record.embed.external.uri).toContain('premarket-movers');
        expect(captured.record.embed.external.uri).toContain('utm_source=bluesky');
    });
});
