/**
 * @jest-environment node
 *
 * impactWorker field semantics:
 *   - impact1h:      priceAtEvent → ticker.lastPrice, first run ≥1h after event
 *   - impactEndDay:  priceAtEvent → event-day regularClose
 *   - impactNextDay: event-day regularClose → NEXT trading day's regularClose
 *   - EOD must not fill when refs[0] is a LATER day than event.date (data gap)
 */
import { updateMoverImpacts } from '@/workers/impactWorker';
import { prisma } from '@/lib/db/prisma';

jest.mock('@/lib/db/prisma', () => ({
    prisma: {
        moverEvent: { findMany: jest.fn(), update: jest.fn().mockResolvedValue({}) },
        dailyRef: { findMany: jest.fn() },
    },
}));

const mockedPrisma = prisma as jest.Mocked<typeof prisma>;
const findMany = mockedPrisma.moverEvent.findMany as jest.Mock;
const dailyRefFindMany = mockedPrisma.dailyRef.findMany as jest.Mock;
const update = mockedPrisma.moverEvent.update as jest.Mock;

const OLD_EVENT = {
    id: 'e1',
    symbol: 'AAA',
    date: new Date('2026-10-09T00:00:00Z'),
    timestamp: new Date(Date.now() - 10 * 60 * 60 * 1000), // 10h ago
    priceAtEvent: 100,
    impactEndDay: null,
    impactNextDay: null,
};

beforeEach(() => jest.clearAllMocks());

test('impact1h uses priceAtEvent → lastPrice', async () => {
    findMany
        .mockResolvedValueOnce([{ ...OLD_EVENT, impact1h: null, ticker: { lastPrice: 105 } }]) // pending1h
        .mockResolvedValueOnce([]); // pendingEOD/nextDay
    await updateMoverImpacts();
    expect(update).toHaveBeenCalledWith({
        where: { id: 'e1' },
        data: { impact1h: 5 },
    });
});

test('EOD = priceAtEvent→eventDay close; nextDay = eventDay close→next close', async () => {
    findMany
        .mockResolvedValueOnce([]) // pending1h
        .mockResolvedValueOnce([OLD_EVENT]); // pending EOD/nextDay
    dailyRefFindMany.mockResolvedValue([
        { date: new Date('2026-10-09T00:00:00Z'), regularClose: 110 },
        { date: new Date('2026-10-12T00:00:00Z'), regularClose: 105 },
    ]);
    await updateMoverImpacts();
    expect(update).toHaveBeenCalledWith({
        where: { id: 'e1' },
        data: { impactEndDay: 10, impactNextDay: (105 - 110) / 110 * 100 },
    });
});

test('data gap: refs[0] later than event.date → no EOD/nextDay write', async () => {
    findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([OLD_EVENT]);
    dailyRefFindMany.mockResolvedValue([
        { date: new Date('2026-10-12T00:00:00Z'), regularClose: 105 }, // wrong day
    ]);
    await updateMoverImpacts();
    expect(update).not.toHaveBeenCalled();
});

test('only event-day close available → EOD fills, nextDay stays null', async () => {
    findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([OLD_EVENT]);
    dailyRefFindMany.mockResolvedValue([
        { date: new Date('2026-10-09T00:00:00Z'), regularClose: 110 },
    ]);
    await updateMoverImpacts();
    expect(update).toHaveBeenCalledWith({
        where: { id: 'e1' },
        data: { impactEndDay: 10 },
    });
});
