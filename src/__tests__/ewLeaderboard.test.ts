/**
 * Tests for the Early Winners leaderboard fetch.
 * Prisma is mocked — no live DB required.
 */
const aggregate = jest.fn();
const findMany = jest.fn();

jest.mock('@/lib/db/prisma', () => ({
  prisma: {
    ewScoreSnapshot: { aggregate, findMany },
  },
}));

// eslint-disable-next-line import/first
import { getLeaderboard, getEwLeaderboardRows } from '@/lib/seo/leaderboards';

const SNAP = {
  symbol: 'AAPL',
  asOfDate: new Date('2026-09-18T00:00:00Z'),
  totalScore: 72.5,
  maxPossible: 65,
  fundamentalsScore: 80.1,
  momentumScore: 65.0,
  qualityScore: 55.0,
  earningsScore: null,
  earningsBlocked: true,
  rank: 1,
  engineVersion: 'EW-V5.0.0',
  rationaleJson: JSON.stringify([
    { key: 'revenueYoYGrowthShock', category: 'FUNDAMENTALS', label: 'Strong year-over-year revenue growth', value: 24.1, notes: null },
    { key: 'priceStrengthPct', category: 'MOMENTUM', label: 'Relative strength vs S&P 500 (6M)', value: 12.3, notes: null },
  ]),
  ticker: { name: 'Apple Inc.', sector: 'TECHNOLOGY', lastPrice: 230.1, lastChangePct: 1.2, lastMarketCap: 3500 },
};

describe('early-winners leaderboard definition', () => {
  it('is registered under /screener/early-winners', () => {
    const def = getLeaderboard('early-winners');
    expect(def).toBeDefined();
    expect(def?.source).toBe('ewScore');
  });
});

describe('getEwLeaderboardRows', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns [] when no snapshot batch exists (no fabricated rows)', async () => {
    aggregate.mockResolvedValue({ _max: { asOfDate: null } });
    const rows = await getEwLeaderboardRows();
    expect(rows).toEqual([]);
    expect(findMany).not.toHaveBeenCalled();
  });

  it('queries only the latest batch date and live-priced tickers', async () => {
    aggregate.mockResolvedValue({ _max: { asOfDate: new Date('2026-09-18T00:00:00Z') } });
    findMany.mockResolvedValue([SNAP]);
    const rows = await getEwLeaderboardRows(50);

    const where = (findMany.mock.calls[0]![0] as { where: Record<string, unknown> }).where;
    expect(where.asOfDate).toEqual(new Date('2026-09-18T00:00:00Z'));
    expect(where.ticker).toEqual({ lastPrice: { gt: 0 } });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      rank: 1,
      symbol: 'AAPL',
      name: 'Apple Inc.',
      totalScore: 72.5,
      fundamentalsScore: 80.1,
      earningsBlocked: true,
    });
  });
});
