/**
 * Unit tests for prevCloseResolver.ts
 *
 * Tests the prevClose resolution chain: Redis → DB → bootstrap fallback.
 * Uses mocked Redis and Prisma — no real DB connection needed.
 */

import { jest } from '@jest/globals';
import { createETDate } from '@/lib/utils/dateET';

// Mock Redis operations
jest.mock('@/lib/redis/operations', () => ({
  getPrevClose: jest.fn(),
  setPrevClose: jest.fn(() => Promise.resolve(true)),
}));

// Mock Redis client
jest.mock('@/lib/redis', () => ({
  redisClient: { isOpen: false },
}));

// Mock Prisma
jest.mock('@/lib/db/prisma', () => ({
  prisma: {
    dailyRef: {
      findMany: jest.fn(),
    },
    sessionPrice: {
      findMany: jest.fn(),
    },
  },
}));

// Mock bootstrapPrevClose (circular dep)
jest.mock('../polygon/bootstrapPrevClose', () => ({
  bootstrapPreviousCloses: jest.fn(() => Promise.resolve()),
}));

import { getPrevClose, setPrevClose } from '@/lib/redis/operations';
import { prisma } from '@/lib/db/prisma';
import { resolvePrevCloses, checkStaticLock, loadRegularCloses, loadFrozenPrices } from '../polygon/prevCloseResolver';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockedGetPrevClose = getPrevClose as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockedSetPrevClose = setPrevClose as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockedDailyRefFindMany = prisma.dailyRef.findMany as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockedSessionPriceFindMany = prisma.sessionPrice.findMany as any;

describe('prevCloseResolver', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('checkStaticLock', () => {
    it('should return unlocked when Redis is closed', async () => {
      const result = await checkStaticLock();
      expect(result.isLocked).toBe(false);
      expect(result.lockAgeSeconds).toBe(0);
    });
  });

  describe('resolvePrevCloses', () => {
    it('should return Redis data when available', async () => {
      const redisMap = new Map([['AAPL', 150.0], ['MSFT', 300.0]]);
      mockedGetPrevClose.mockResolvedValueOnce(redisMap);

      const result = await resolvePrevCloses(
        ['AAPL', 'MSFT'], '2026-07-10', createETDate('2026-07-10'), 'test-key', false
      );

      expect(result.size).toBe(2);
      expect(result.get('AAPL')).toBe(150.0);
      expect(result.get('MSFT')).toBe(300.0);
    });

    it('should fallback to DB when Redis is empty', async () => {
      mockedGetPrevClose.mockResolvedValueOnce(new Map());
      mockedDailyRefFindMany.mockResolvedValueOnce([
        { symbol: 'AAPL', previousClose: 145.0 },
        { symbol: 'MSFT', previousClose: 290.0 },
      ]);

      const result = await resolvePrevCloses(
        ['AAPL', 'MSFT'], '2026-07-10', createETDate('2026-07-10'), 'test-key', false
      );

      expect(result.size).toBe(2);
      expect(result.get('AAPL')).toBe(145.0);
      expect(mockedSetPrevClose).toHaveBeenCalledWith('2026-07-10', 'AAPL', 145.0);
    });

    it('should return empty map when all sources fail', async () => {
      mockedGetPrevClose.mockResolvedValue(new Map());
      mockedDailyRefFindMany.mockResolvedValueOnce([]);

      const result = await resolvePrevCloses(
        ['AAPL'], '2026-07-10', createETDate('2026-07-10'), 'test-key', false
      );

      expect(result.size).toBe(0);
    });
  });

  describe('loadRegularCloses', () => {
    it('should return empty map for pre-market session', async () => {
      const result = await loadRegularCloses(['AAPL'], createETDate('2026-07-10'), 'pre');
      expect(result.size).toBe(0);
      expect(mockedDailyRefFindMany).not.toHaveBeenCalled();
    });

    it('should load from DB for after-hours session', async () => {
      mockedDailyRefFindMany.mockResolvedValueOnce([
        { symbol: 'AAPL', regularClose: 150.0 },
      ]);

      const result = await loadRegularCloses(['AAPL'], createETDate('2026-07-10'), 'after');

      expect(result.size).toBe(1);
      expect(result.get('AAPL')).toBe(150.0);
    });
  });

  describe('loadFrozenPrices', () => {
    it('should return empty map when useFrozenPrice is false', async () => {
      const result = await loadFrozenPrices(['AAPL'], false);
      expect(result.size).toBe(0);
    });

    it('should load from DB when useFrozenPrice is true', async () => {
      mockedSessionPriceFindMany.mockResolvedValueOnce([
        { symbol: 'AAPL', lastPrice: 155.0, lastTs: new Date('2026-07-10T20:00:00Z') },
      ]);

      const result = await loadFrozenPrices(['AAPL'], true);

      expect(result.size).toBe(1);
      expect(result.get('AAPL')?.price).toBe(155.0);
    });
  });
});
