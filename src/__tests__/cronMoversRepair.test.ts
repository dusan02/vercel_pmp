/**
 * @jest-environment node
 *
 * P0 cron repair coverage:
 *   - gemini-1.5-flash is retired (404 NOT_FOUND) — both AI paths must call gemini-2.5-flash
 *   - /api/cron/reset-movers clears moversReason/moversCategory/socialCopy so
 *     aiMoversService (!moversReason filter) can reprocess movers next day
 *   - movers-insights only processes tickers WITHOUT a reason; after reset the
 *     same ticker becomes eligible again
 */
import { aiService } from '@/services/aiService';
import { aiMoversService } from '@/services/aiMoversService';
import { POST } from '@/app/api/cron/reset-movers/route';
import { prisma } from '@/lib/db/prisma';
import { redisClient } from '@/lib/redis';

jest.mock('@/lib/db/prisma', () => ({
    prisma: {
        ticker: {
            updateMany: jest.fn().mockResolvedValue({ count: 13 }),
            findMany: jest.fn().mockResolvedValue([]),
            update: jest.fn().mockResolvedValue({}),
        },
    },
}));

jest.mock('@/lib/redis', () => ({
    redisClient: {
        isOpen: true,
        zRange: jest.fn().mockResolvedValue([]),
        hSet: jest.fn().mockResolvedValue(0),
        scanIterator: jest.fn().mockReturnValue((async function* () { yield []; })()),
        multi: jest.fn().mockReturnValue({ hDel: jest.fn().mockReturnThis(), exec: jest.fn().mockResolvedValue([]) }),
    },
}));

jest.mock('@/lib/utils/cronAuth', () => ({
    verifyCronAuth: jest.fn().mockReturnValue(null),
    verifyCronAuthOptional: jest.fn().mockReturnValue(null),
    withCronLock: jest.fn((_n: string, _t: number, fn: () => unknown) => fn()),
    withCronHandler: jest.fn((_n: string, fn: (r: unknown) => unknown) => fn),
}));

jest.mock('@/lib/clients/polygonClient', () => ({ getPolygonClient: jest.fn() }));
jest.mock('@/lib/clients/finnhubClient', () => ({ FINNHUB_API_KEY: undefined }));

jest.mock('@/lib/utils/dateET', () => ({ getDateET: jest.fn().mockReturnValue('2026-09-21') }));
jest.mock('@/lib/utils/timeUtils', () => ({
    detectSession: jest.fn().mockReturnValue('regular'),
    mapToRedisSession: jest.fn().mockReturnValue('regular'),
}));

const fetchMock = jest.fn();
const ticker = (prisma as any).ticker;
const redis = redisClient as any;

const geminiOk = (text: string) => ({
    ok: true,
    json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] }),
});

describe('Gemini model — gemini-2.5-flash (1.5-flash is retired)', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        global.fetch = fetchMock;
        process.env.GEMINI_API_KEY = 'test-gemini-key';
        delete process.env.OPENAI_API_KEY;
        delete process.env.GEMINI_MODEL;
    });
    afterEach(() => {
        delete process.env.GEMINI_API_KEY;
        delete process.env.GEMINI_MODEL;
    });

    it('aiService calls generateContent on gemini-2.5-flash', async () => {
        fetchMock.mockResolvedValueOnce(geminiOk('Solidný rast.'));
        const verdict = await aiService.generateInvestmentVerdict({ ticker: 'NVDA' });
        expect(verdict).toBe('Solidný rast.');
        const url = String(fetchMock.mock.calls[0][0]);
        expect(url).toContain('/models/gemini-2.5-flash:generateContent');
        expect(url).toContain('key=test-gemini-key');
        expect(url).not.toContain('gemini-1.5');
    });

    it('aiMoversService calls generateContent on gemini-2.5-flash', async () => {
        fetchMock.mockResolvedValueOnce(geminiOk(
            '{"reason":"r","category":"Technical","socialCopy":"s","isSbcAlert":false,"aiConfidence":80}'
        ));
        const insight = await (aiMoversService as any).callGemini('prompt', 'test-gemini-key');
        expect(insight?.reason).toBe('r');
        const url = String(fetchMock.mock.calls[0][0]);
        expect(url).toContain('/models/gemini-2.5-flash:generateContent');
        expect(url).not.toContain('gemini-1.5');
    });

    it('GEMINI_MODEL env overrides the default in both services', async () => {
        process.env.GEMINI_MODEL = 'gemini-flash-latest';
        fetchMock.mockResolvedValue(geminiOk('x'));
        await aiService.generateInvestmentVerdict({ t: 1 });
        await (aiMoversService as any).callGemini('p', 'k').catch(() => null);
        for (const call of fetchMock.mock.calls) {
            expect(String(call[0])).toContain('/models/gemini-flash-latest:generateContent');
        }
    });
});

describe('POST /api/cron/reset-movers', () => {
    beforeEach(() => jest.clearAllMocks());

    it('clears movers AI fields on all rows that have any of them set', async () => {
        const res = await POST(new Request('http://localhost/api/cron/reset-movers', { method: 'POST' }) as any);
        expect(res.status).toBe(200);
        expect(ticker.updateMany).toHaveBeenCalledWith({
            where: {
                OR: [
                    { moversReason: { not: null } },
                    { moversCategory: { not: null } },
                    { socialCopy: { not: null } },
                ],
            },
            data: {
                moversReason: null,
                moversCategory: null,
                socialCopy: null,
                isSbcAlert: false,
                aiConfidence: null,
            },
        });
        const body = await res.json();
        expect(body.results.dbUpdated).toBe(13);
    });
});

describe('movers-insights reprocessing after reset', () => {
    const mover = (symbol: string, reason: string | null) => ({
        symbol,
        name: symbol + ' Inc',
        latestMoversZScore: 3.1,
        latestMoversRVOL: 2.5,
        lastChangePct: 6.2,
        lastPrice: 100,
        sector: 'Tech',
        moversReason: reason,
    });

    beforeEach(() => {
        jest.clearAllMocks();
        delete process.env.GEMINI_API_KEY; // → no-LLM path → buildNoNewsFallback still produces an insight
    });

    it('skips tickers that already have moversReason; processes those without', async () => {
        redis.zRange.mockResolvedValueOnce(['NVDA', 'OLD']);
        ticker.findMany.mockResolvedValueOnce([mover('NVDA', null), mover('OLD', 'stale reason')]);
        const { success } = await aiMoversService.processMoversInsights();
        expect(success).toBe(1);
        expect(ticker.update).toHaveBeenCalledTimes(1);
        expect(ticker.update.mock.calls[0][0].where.symbol).toBe('NVDA');
    });

    it('after reset (moversReason=null) the same ticker is processed again', async () => {
        redis.zRange.mockResolvedValueOnce(['OLD']);
        ticker.findMany.mockResolvedValueOnce([mover('OLD', null)]);
        const { success } = await aiMoversService.processMoversInsights();
        expect(success).toBe(1);
        expect(ticker.update).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { symbol: 'OLD' },
                data: expect.objectContaining({ moversReason: expect.any(String) }),
            })
        );
    });
});
