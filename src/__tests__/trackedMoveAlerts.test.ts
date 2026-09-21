/**
 * Tracked-move alerts — dedup + level-escalation semantics.
 *
 * Contract (worker trigger, single process):
 *   σ 2.1 → push      (enters "unusual" state)
 *   σ 2.2 → silent    (same level — per-level key already claimed)
 *   σ 4.0 → push      (escalation → new level key)
 *   σ 5.0 → push      (escalation → extreme)
 *   σ 2.5 after 4.0 → silent (max-level gate — no downgrade alert)
 *   same event re-ingested → silent (atomic claim dedup)
 *   below 2σ → never notifies
 *   any Redis/DB failure → resolves, never throws (must not break ingest)
 */
import { maybeNotifyTrackedMove } from '@/services/alerts/trackedMoveAlerts';
import { NotificationService } from '@/services/notificationService';
import { redisOps } from '@/lib/redis/enhancedOperations';

jest.mock('@/services/notificationService', () => ({
    NotificationService: { notifyTrackedMove: jest.fn() },
}));

jest.mock('@/lib/redis/enhancedOperations', () => ({
    redisOps: {
        get: jest.fn(),
        setNx: jest.fn(),
        setEx: jest.fn(),
        del: jest.fn(),
    },
}));

const notifyMock = NotificationService.notifyTrackedMove as jest.Mock;
const getMock = redisOps.get as jest.Mock;
const setNxMock = redisOps.setNx as jest.Mock;
const setExMock = redisOps.setEx as jest.Mock;
const delMock = redisOps.del as jest.Mock;

/** Simulate Redis state across calls: max-level store + per-level claims. */
function wireRedisState() {
    const store = new Map<string, string>();
    getMock.mockImplementation(async (k: string) => store.get(k) ?? null);
    setNxMock.mockImplementation(async (k: string, _t: number, v: string) => {
        if (store.has(k)) return false;
        store.set(k, v);
        return true;
    });
    setExMock.mockImplementation(async (k: string, _t: number, v: string) => {
        store.set(k, v);
        return true;
    });
    delMock.mockImplementation(async (k: string) => store.delete(k));
    return store;
}

const input = (zScore: number, over: Partial<Parameters<typeof maybeNotifyTrackedMove>[0]> = {}) => ({
    symbol: 'NVDA',
    zScore,
    changePct: 5.8,
    dateET: '2026-09-21',
    reason: null,
    ...over,
});

describe('maybeNotifyTrackedMove', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        wireRedisState();
        notifyMock.mockResolvedValue({ subscribers: 1, sent: 1, failed: 0 });
    });

    it('notifies once when a ticker enters the unusual state (σ 2.1)', async () => {
        const r = await maybeNotifyTrackedMove(input(2.1));
        expect(r.notified).toBe(true);
        expect(r.level).toBe('unusual');
        expect(notifyMock).toHaveBeenCalledTimes(1);
        expect(notifyMock).toHaveBeenCalledWith('NVDA', expect.objectContaining({
            changePct: 5.8,
            zScore: 2.1,
        }));
    });

    it('does not re-notify on a repeated event at the same level (σ 2.2)', async () => {
        await maybeNotifyTrackedMove(input(2.1));
        const r = await maybeNotifyTrackedMove(input(2.2));
        expect(r.notified).toBe(false);
        expect(notifyMock).toHaveBeenCalledTimes(1);
    });

    it('dedups the exact same event ingested twice', async () => {
        const first = await maybeNotifyTrackedMove(input(2.5));
        const second = await maybeNotifyTrackedMove(input(2.5));
        expect(first.notified).toBe(true);
        expect(second.notified).toBe(false);
        expect(notifyMock).toHaveBeenCalledTimes(1);
    });

    it('escalates: σ 4.0 and σ 5.0 each produce a new push', async () => {
        await maybeNotifyTrackedMove(input(2.1));
        const very = await maybeNotifyTrackedMove(input(4.0));
        const extreme = await maybeNotifyTrackedMove(input(5.2));
        expect(very.notified).toBe(true);
        expect(very.level).toBe('very_unusual');
        expect(extreme.notified).toBe(true);
        expect(extreme.level).toBe('extreme');
        expect(notifyMock).toHaveBeenCalledTimes(3);
    });

    it('does not downgrade-alert: σ 2.5 after σ 4.0 stays silent', async () => {
        await maybeNotifyTrackedMove(input(4.0));
        const r = await maybeNotifyTrackedMove(input(2.5));
        expect(r.notified).toBe(false);
        expect(notifyMock).toHaveBeenCalledTimes(1);
    });

    it('ignores sub-threshold moves (σ < 2)', async () => {
        for (const z of [0, 1.2, -1.9, null as unknown as number]) {
            const r = await maybeNotifyTrackedMove(input(z));
            expect(r.notified).toBe(false);
        }
        expect(notifyMock).not.toHaveBeenCalled();
        // below threshold → no Redis work at all
        expect(setNxMock).not.toHaveBeenCalled();
    });

    it('scopes dedup per trading day — same level next day notifies again', async () => {
        await maybeNotifyTrackedMove(input(2.5, { dateET: '2026-09-21' }));
        const r = await maybeNotifyTrackedMove(input(2.5, { dateET: '2026-09-22' }));
        expect(r.notified).toBe(true);
        expect(notifyMock).toHaveBeenCalledTimes(2);
    });

    it('scopes dedup per symbol — different tickers are independent', async () => {
        await maybeNotifyTrackedMove(input(2.5, { symbol: 'NVDA' }));
        const r = await maybeNotifyTrackedMove(input(2.5, { symbol: 'TSLA' }));
        expect(r.notified).toBe(true);
        expect(notifyMock).toHaveBeenCalledTimes(2);
    });

    it('fails closed and never throws when Redis is down', async () => {
        getMock.mockRejectedValue(new Error('redis down'));
        const r = await maybeNotifyTrackedMove(input(3.0));
        expect(r.notified).toBe(false);
    });

    it('does not update max-level when the atomic claim loses a race', async () => {
        setNxMock.mockResolvedValue(false); // another writer won
        const r = await maybeNotifyTrackedMove(input(3.0));
        expect(r.notified).toBe(false);
        expect(notifyMock).not.toHaveBeenCalled();
    });

    it('releases the claim on total transient delivery failure — next tick retries', async () => {
        notifyMock.mockResolvedValue({ subscribers: 2, sent: 0, failed: 2 });

        const failed = await maybeNotifyTrackedMove(input(2.5));
        expect(failed.notified).toBe(false);
        expect(delMock).toHaveBeenCalledWith('alert:NVDA:2026-09-21:lvl1');

        // Push recovered — same event notifies and does not re-release
        notifyMock.mockResolvedValue({ subscribers: 2, sent: 2, failed: 0 });
        const retried = await maybeNotifyTrackedMove(input(2.5));
        expect(retried.notified).toBe(true);
        expect(notifyMock).toHaveBeenCalledTimes(2);
    });

    it('keeps the claim when there are simply no subscribers', async () => {
        notifyMock.mockResolvedValue({ subscribers: 0, sent: 0, failed: 0 });
        const r = await maybeNotifyTrackedMove(input(3.0));
        expect(r.notified).toBe(true);
        // second event at same level short-circuits before send
        await maybeNotifyTrackedMove(input(3.5));
        expect(notifyMock).toHaveBeenCalledTimes(1);
    });
});
