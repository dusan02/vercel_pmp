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

        // Upsert the subscription
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

export async function DELETE(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const endpoint = searchParams.get('endpoint');

        if (!endpoint) {
            return NextResponse.json({ error: 'Endpoint is required' }, { status: 400 });
        }

        await (prisma as any).subscription.delete({
            where: { endpoint }
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting subscription:', error);
        return NextResponse.json({ error: 'Failed to unsubscribe' }, { status: 500 });
    }
}
