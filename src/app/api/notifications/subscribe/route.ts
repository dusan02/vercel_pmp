import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { subscription, email, symbol } = body;

        if (!subscription || !subscription.endpoint) {
            return NextResponse.json({ error: 'Invalid subscription object' }, { status: 400 });
        }

        const { endpoint, keys } = subscription;
        if (!keys || !keys.p256dh || !keys.auth) {
            return NextResponse.json({ error: 'Invalid keys in subscription' }, { status: 400 });
        }

        // Per-symbol move alert → SymbolAlert (separate opt-in from the
        // broadcast Subscription/digest list).
        if (symbol) {
            const sym = String(symbol).toUpperCase();
            const alert = await (prisma as any).symbolAlert.upsert({
                where: { endpoint_symbol: { endpoint, symbol: sym } },
                update: { p256dh: keys.p256dh, auth: keys.auth },
                create: { endpoint, symbol: sym, p256dh: keys.p256dh, auth: keys.auth }
            });
            return NextResponse.json({ success: true, id: alert.id });
        }

        // Broadcast opt-in (movers digest / quality breakouts)
        const sub = await (prisma as any).subscription.upsert({
            where: { endpoint },
            update: {
                p256dh: keys.p256dh,
                auth: keys.auth,
                email: email || undefined,
                symbol: symbol || undefined
            },
            create: {
                endpoint,
                p256dh: keys.p256dh,
                auth: keys.auth,
                email: email || null,
                symbol: symbol || null
            }
        });

        return NextResponse.json({ success: true, id: sub.id });
    } catch (error) {
        console.error('Error saving subscription:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

// GET ?endpoint=... → symbols this endpoint watches (per-symbol toggle state)
export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const endpoint = searchParams.get('endpoint');

        if (!endpoint) {
            return NextResponse.json({ error: 'Endpoint is required' }, { status: 400 });
        }

        const alerts = await (prisma as any).symbolAlert.findMany({
            where: { endpoint },
            select: { symbol: true }
        });

        return NextResponse.json({ symbols: alerts.map((a: { symbol: string }) => a.symbol) });
    } catch (error) {
        console.error('Error fetching symbol alerts:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function DELETE(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const endpoint = searchParams.get('endpoint');
        const symbol = searchParams.get('symbol');

        if (!endpoint) {
            return NextResponse.json({ error: 'Endpoint is required' }, { status: 400 });
        }

        // Per-symbol unsubscribe — removes only that alert, keeps the rest.
        if (symbol) {
            await (prisma as any).symbolAlert.deleteMany({
                where: { endpoint, symbol: symbol.toUpperCase() }
            });
            return NextResponse.json({ success: true });
        }

        // Full opt-out — broadcast subscription plus all symbol alerts
        // (browser push subscription is being removed anyway).
        await (prisma as any).subscription.delete({
            where: { endpoint }
        }).catch(() => {});
        await (prisma as any).symbolAlert.deleteMany({
            where: { endpoint }
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting subscription:', error);
        return NextResponse.json({ error: 'Failed to unsubscribe' }, { status: 500 });
    }
}
