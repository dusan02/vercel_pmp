import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// Mock the Redis client — capture zRangeWithScores calls to assert the
// index/direction semantics of getRankMinMax.
const zRangeWithScores = jest.fn() as jest.MockedFunction<any>;

jest.mock('@/lib/redis/client', () => ({
    redisClient: {
        isOpen: true,
        zRangeWithScores: (...args: any[]) => zRangeWithScores(...args),
    },
}));

import { getRankMinMax } from '@/lib/redis/ranking';

describe('getRankMinMax', () => {
    beforeEach(() => {
        zRangeWithScores.mockReset();
    });

    it('returns max as the LAST asc element (score-sorted asc = biggest last)', async () => {
        // `:asc` ZSET ordered by score ascending: [loser ... gainer]
        zRangeWithScores.mockImplementation(async (_key: string, start: number) => {
            if (start === 0) return [{ value: 'LOSER', score: -12.5 }];
            return [{ value: 'GAINER', score: 34.2 }]; // start === -1
        });

        const res = await getRankMinMax('2026-10-03', 'live', 'chg');

        expect(zRangeWithScores).toHaveBeenCalledTimes(2);
        // min → first element of the ascending ZSET
        expect(zRangeWithScores).toHaveBeenNthCalledWith(1, expect.stringContaining('rank:chg:'), 0, 0);
        // max → last element of the same ascending ZSET, WITHOUT REV.
        // Regression: `zRangeWithScores(key, -1, -1, { REV: true })` used to
        // return the minimum — with REV, indexes address the reversed order.
        const second = zRangeWithScores.mock.calls[1];
        expect(second[1]).toBe(-1);
        expect(second[2]).toBe(-1);
        expect(second[3]).toBeUndefined();

        expect(res.min).toEqual({ sym: 'LOSER', v: -12.5 });
        expect(res.max).toEqual({ sym: 'GAINER', v: 34.2 });
    });

    it('returns nulls when Redis is empty', async () => {
        zRangeWithScores.mockResolvedValue([]);
        const res = await getRankMinMax('2026-10-03', 'live', 'cap');
        expect(res).toEqual({ min: null, max: null });
    });
});
