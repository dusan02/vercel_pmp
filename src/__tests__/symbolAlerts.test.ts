/**
 * @jest-environment node
 *
 * Per-symbol alert API + delivery contract.
 *
 * SymbolAlert is a separate opt-in from Subscription (digest/broadcast):
 *   - POST with symbol → SymbolAlert upsert, Subscription untouched
 *   - one endpoint → N symbols
 *   - DELETE with symbol → removes only that alert
 *   - DELETE without symbol → full opt-out (broadcast + all alerts)
 *   - push 404/410 → stale alert rows are removed
 */
import { POST, GET, DELETE } from '@/app/api/notifications/subscribe/route';
import { prisma } from '@/lib/db/prisma';
import { NotificationService } from '@/services/notificationService';
import webpush from 'web-push';

jest.mock('@/lib/db/prisma', () => ({
    prisma: {
        symbolAlert: {
            upsert: jest.fn().mockResolvedValue({ id: 'alert-1' }),
            findMany: jest.fn().mockResolvedValue([]),
            delete: jest.fn().mockResolvedValue({}),
            deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        subscription: {
            upsert: jest.fn().mockResolvedValue({ id: 'sub-1' }),
            delete: jest.fn().mockResolvedValue({}),
            findMany: jest.fn().mockResolvedValue([]),
        },
    },
}));

jest.mock('web-push', () => ({
    setVapidDetails: jest.fn(),
    sendNotification: jest.fn().mockResolvedValue({}),
}));

jest.mock('nodemailer', () => ({
    createTransport: jest.fn().mockReturnValue({ sendMail: jest.fn() }),
}));

const symbolAlert = (prisma as any).symbolAlert;
const subscription = (prisma as any).subscription;
const sendMock = webpush.sendNotification as jest.Mock;

const sub = (endpoint = 'https://push.example.com/ep1') => ({
    endpoint,
    keys: { p256dh: 'p256dh-key', auth: 'auth-key' },
});

const postReq = (body: unknown) =>
    new Request('http://localhost/api/notifications/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });

const delReq = (qs: string) =>
    new Request(`http://localhost/api/notifications/subscribe?${qs}`, { method: 'DELETE' });

describe('symbol alert subscribe API', () => {
    beforeEach(() => jest.clearAllMocks());

    it('POST with symbol upserts SymbolAlert and does NOT touch Subscription', async () => {
        const res = await POST(postReq({ subscription: sub(), symbol: 'nvda' }));
        expect(res.status).toBe(200);
        expect(symbolAlert.upsert).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { endpoint_symbol: { endpoint: sub().endpoint, symbol: 'NVDA' } },
            })
        );
        // alert-only users must not land on the digest list
        expect(subscription.upsert).not.toHaveBeenCalled();
    });

    it('POST without symbol keeps broadcast Subscription semantics', async () => {
        await POST(postReq({ subscription: sub(), email: 'a@b.c' }));
        expect(subscription.upsert).toHaveBeenCalled();
        expect(symbolAlert.upsert).not.toHaveBeenCalled();
    });

    it('subscribe to A then B — both upserts use the composite key', async () => {
        await POST(postReq({ subscription: sub(), symbol: 'NVDA' }));
        await POST(postReq({ subscription: sub(), symbol: 'TSLA' }));
        const wheres = symbolAlert.upsert.mock.calls.map((c: any[]) => c[0].where.endpoint_symbol);
        expect(wheres).toEqual([
            { endpoint: sub().endpoint, symbol: 'NVDA' },
            { endpoint: sub().endpoint, symbol: 'TSLA' },
        ]);
    });

    it('duplicate subscribe is idempotent (upsert, same key)', async () => {
        await POST(postReq({ subscription: sub(), symbol: 'NVDA' }));
        await POST(postReq({ subscription: sub(), symbol: 'NVDA' }));
        expect(symbolAlert.upsert).toHaveBeenCalledTimes(2);
        const keys = symbolAlert.upsert.mock.calls.map((c: any[]) => c[0].where.endpoint_symbol);
        expect(keys[0]).toEqual(keys[1]);
    });

    it('GET returns the symbols this endpoint watches', async () => {
        symbolAlert.findMany.mockResolvedValueOnce([{ symbol: 'NVDA' }, { symbol: 'TSLA' }]);
        const res = await GET(new Request(
            `http://localhost/api/notifications/subscribe?endpoint=${encodeURIComponent(sub().endpoint)}`
        ));
        const data = await res.json();
        expect(data.symbols).toEqual(['NVDA', 'TSLA']);
    });

    it('DELETE with symbol removes only that alert', async () => {
        await DELETE(delReq(`endpoint=${encodeURIComponent(sub().endpoint)}&symbol=NVDA`));
        expect(symbolAlert.deleteMany).toHaveBeenCalledWith({
            where: { endpoint: sub().endpoint, symbol: 'NVDA' },
        });
        expect(subscription.delete).not.toHaveBeenCalled();
    });

    it('DELETE without symbol is a full opt-out — broadcast + all alerts', async () => {
        await DELETE(delReq(`endpoint=${encodeURIComponent(sub().endpoint)}`));
        expect(subscription.delete).toHaveBeenCalledWith({ where: { endpoint: sub().endpoint } });
        expect(symbolAlert.deleteMany).toHaveBeenCalledWith({ where: { endpoint: sub().endpoint } });
    });

    it('rejects requests without endpoint', async () => {
        const res = await DELETE(delReq('symbol=NVDA'));
        expect(res.status).toBe(400);
    });
});

describe('notifyTrackedMove delivery', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        symbolAlert.findMany.mockResolvedValue([]);
    });

    it('sends to every endpoint subscribed to the symbol with a /premarket/ URL', async () => {
        symbolAlert.findMany.mockResolvedValue([
            { id: 'a1', endpoint: 'ep1', p256dh: 'k1', auth: 'a1' },
            { id: 'a2', endpoint: 'ep2', p256dh: 'k2', auth: 'a2' },
        ]);
        await NotificationService.notifyTrackedMove('NVDA', {
            changePct: 5.8, zScore: 3.1, sigmaLabel: 'Very unusual', reason: 'Earnings',
        });
        expect(sendMock).toHaveBeenCalledTimes(2);
        const payload = JSON.parse(sendMock.mock.calls[0][1]);
        expect(payload.url).toBe('/premarket/NVDA');
        expect(payload.title).toContain('NVDA');
        expect(payload.title).toContain('+5.8%');
        expect(payload.body).toContain('Earnings');
        expect(payload.body).toContain('3.1');
    });

    it('does nothing when nobody watches the symbol', async () => {
        await NotificationService.notifyTrackedMove('NVDA', {
            changePct: 5.8, zScore: 3.1, sigmaLabel: 'Very unusual',
        });
        expect(sendMock).not.toHaveBeenCalled();
    });

    it('removes stale alerts on 404/410 push failures', async () => {
        symbolAlert.findMany.mockResolvedValue([{ id: 'a1', endpoint: 'ep1', p256dh: 'k', auth: 'a' }]);
        sendMock.mockRejectedValueOnce({ statusCode: 410 });
        await NotificationService.notifyTrackedMove('NVDA', {
            changePct: 5.8, zScore: 3.1, sigmaLabel: 'Very unusual',
        });
        expect(symbolAlert.delete).toHaveBeenCalledWith({ where: { id: 'a1' } });
    });

    it('keeps the alert on transient push failures (non-404/410)', async () => {
        symbolAlert.findMany.mockResolvedValue([{ id: 'a1', endpoint: 'ep1', p256dh: 'k', auth: 'a' }]);
        sendMock.mockRejectedValueOnce({ statusCode: 500 });
        await NotificationService.notifyTrackedMove('NVDA', {
            changePct: 5.8, zScore: 3.1, sigmaLabel: 'Very unusual',
        });
        expect(symbolAlert.delete).not.toHaveBeenCalled();
    });
});
