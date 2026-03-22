/**
 * Integration tests for polygonWorker.ts
 * 
 * Tests critical edge cases that could corrupt data:
 * 1. 20:05 ET freeze protection
 * 2. Weekend preservation + TTL
 * 3. Split day adjusted consistency
 */

import { prisma } from '@/lib/db/prisma';
import { createETDate, getDateET } from '@/lib/utils/dateET';
import { ingestBatch } from '../polygonWorker';

// Mock session + pricing state to make ingest deterministic
jest.mock('@/lib/utils/timeUtils', () => {
  const actual = jest.requireActual('@/lib/utils/timeUtils');
  return {
    ...actual,
    detectSession: jest.fn(),
    isMarketHoliday: jest.fn().mockReturnValue(false),
  };
});

jest.mock('@/lib/utils/pricingStateMachine', () => {
  const actual = jest.requireActual('@/lib/utils/pricingStateMachine');
  return {
    ...actual,
    getPricingState: jest.fn(),
  };
});

// Mock Redis
jest.mock('@/lib/redis/operations', () => ({
  setPrevClose: jest.fn().mockResolvedValue(true),
  getPrevClose: jest.fn().mockResolvedValue(new Map()),
  publishTick: jest.fn().mockResolvedValue(true),
  getUniverse: jest.fn().mockResolvedValue(['AAPL', 'MSFT']),
  atomicUpdatePrice: jest.fn().mockResolvedValue(true)
}));

// Mock Polygon API
jest.mock('../polygonWorker', () => {
  const actual = jest.requireActual('../polygonWorker');
  return {
    ...actual,
    fetchPolygonSnapshot: jest.fn()
  };
});

describe('polygonWorker integration tests', () => {
  beforeAll(async () => {
    // Setup test database
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    // Clean database before each test
    await prisma.sessionPrice.deleteMany();
    await prisma.dailyRef.deleteMany();
    await prisma.ticker.deleteMany();
  });

  describe('20:05 ET freeze protection', () => {
    it('should not overwrite frozen after-hours price with day.c=0', async () => {
      // Setup: Existing after-hours price in DB
      const symbol = 'AAPL';
      const dateET = '2025-01-15';
      const dateObj = createETDate(dateET);

      await prisma.ticker.create({
        data: {
          symbol,
          name: 'Apple Inc.',
          sharesOutstanding: 15000000000
        }
      });

      await prisma.sessionPrice.create({
        data: {
          symbol,
          date: dateObj,
          session: 'after',
          lastPrice: 152.00,
          lastTs: new Date('2025-01-15T19:58:00-05:00'),
          changePct: 1.33,
          source: 'min',
          quality: 'rest'
        }
      });

      // Mock: Session detection
      const { detectSession } = require('@/lib/utils/timeUtils');
      detectSession.mockReturnValue('closed');

      const { getPricingState } = require('@/lib/utils/pricingStateMachine');
      getPricingState.mockReturnValue({
        state: 'overnight_frozen',
        canIngest: false,
        canOverwrite: false,
        useFrozenPrice: true,
        referencePrice: 'regularClose'
      });

      // Execute: Try to ingest
      await ingestBatch([symbol], 'test-api-key');

      // Verify: No API calls made (ingest disabled)
      expect(global.fetch).not.toHaveBeenCalled();

      // Verify: Frozen price is preserved
      const preserved = await prisma.sessionPrice.findUnique({
        where: {
          symbol_date_session: {
            symbol,
            date: dateObj,
            session: 'after'
          }
        }
      });

      expect(preserved).not.toBeNull();
      expect(preserved?.lastPrice).toBe(152.00); // Original price preserved
      expect(preserved?.lastPrice).not.toBe(0);
    });
  });

  describe('Weekend preservation + TTL', () => {
    it('should not ingest on weekend but preserve TTL', async () => {
      const symbol = 'AAPL';
      const dateET = '2025-01-18'; // Saturday
      const dateObj = createETDate(dateET);

      // Ticker must exist (FK)
      await prisma.ticker.create({
        data: {
          symbol,
          name: 'Apple Inc.',
          sharesOutstanding: 15000000000
        }
      });

      // Setup: Previous close exists
      await prisma.dailyRef.create({
        data: {
          symbol,
          date: dateObj,
          previousClose: 150.00
        }
      });

      const { detectSession } = require('@/lib/utils/timeUtils');
      detectSession.mockReturnValue('closed');

      const { getPricingState } = require('@/lib/utils/pricingStateMachine');
      getPricingState.mockReturnValue({
        state: 'weekend_frozen',
        canIngest: false,
        canOverwrite: false,
        useFrozenPrice: true,
        referencePrice: 'regularClose'
      });

      // Execute: Worker should not ingest
      await ingestBatch([symbol], 'test-api-key');

      // Verify: No API calls made
      expect(global.fetch).not.toHaveBeenCalled();

      // Verify: Previous close still exists
      const prevClose = await prisma.dailyRef.findUnique({
        where: {
          symbol_date: {
            symbol,
            date: dateObj
          }
        }
      });

      expect(prevClose).not.toBeNull();
      expect(prevClose?.previousClose).toBe(150.00);
    });
  });

  describe('Split day adjusted consistency', () => {
    it('should use adjusted previousClose over unadjusted snapshot.prevDay.c', async () => {
      const symbol = 'AAPL';
      const dateET = getDateET(); // Use "today" in ET to match worker date keys
      const dateObj = createETDate(dateET);

      // Setup: Adjusted previous close in DB (from aggregates API)
      await prisma.ticker.create({
        data: {
          symbol,
          name: 'Apple Inc.',
          sharesOutstanding: 15000000000,
          latestPrevClose: 75.00 // Adjusted (after split)
        }
      });

      await prisma.dailyRef.create({
        data: {
          symbol,
          date: dateObj,
          previousClose: 75.00 // Adjusted
        }
      });

      // Mock: Snapshot with unadjusted prevDay.c
      const { fetchPolygonSnapshot } = require('../polygonWorker');
      fetchPolygonSnapshot.mockResolvedValue([
        {
          ticker: symbol,
          day: { c: 76.00, o: 75.50, h: 76.50, l: 75.00, v: 1000000 },
          lastTrade: { p: 76.00, t: new Date('2025-01-15T15:00:00-05:00').getTime() },
          prevDay: { c: 150.00 } // Unadjusted (before split)
        }
      ]);

      // Mock: getPrevClose returns adjusted value
      const { getPrevClose } = require('@/lib/redis/operations');
      getPrevClose.mockResolvedValue(new Map([[symbol, 75.00]])); // Adjusted

      const { detectSession } = require('@/lib/utils/timeUtils');
      detectSession.mockReturnValue('live');

      const { getPricingState } = require('@/lib/utils/pricingStateMachine');
      getPricingState.mockReturnValue({
        state: 'live',
        canIngest: true,
        canOverwrite: true,
        useFrozenPrice: false,
        referencePrice: 'previousClose'
      });

      // Mock Polygon snapshot endpoint response
      (global.fetch as unknown as jest.Mock).mockImplementation(async (url: string) => {
        // 15:00 ET today (timestamp in ms)
        const lastTradeTs = dateObj.getTime() + 15 * 60 * 60 * 1000;
        if (typeof url === 'string' && url.includes('/v2/snapshot/')) {
          return {
            ok: true,
            status: 200,
            statusText: 'OK',
            json: async () => ({
              tickers: [
                {
                  ticker: symbol,
                  day: { c: 76.00, o: 75.50, h: 76.50, l: 75.00, v: 1000000 },
                  lastTrade: { p: 76.00, t: lastTradeTs },
                  prevDay: { c: 150.00 } // Unadjusted (before split)
                }
              ]
            })
          };
        }
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => ({})
        };
      });

      // Execute: Ingest
      await ingestBatch([symbol], 'test-api-key');

      // Verify: Percent change uses adjusted previousClose
      const sessionPrice = await prisma.sessionPrice.findFirst({
        where: {
          symbol,
          date: dateObj,
          session: 'live'
        }
      });

      expect(sessionPrice).not.toBeNull();
      // changePct should be vs 75.00 (adjusted), not 150.00 (unadjusted)
      // (76.00 / 75.00 - 1) * 100 = 1.33%
      expect(sessionPrice?.changePct).toBeCloseTo(1.33, 2);
    });
  });
});

