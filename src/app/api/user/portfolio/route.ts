
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';

export async function GET(req: NextRequest) {
    const session = await auth();

    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const portfolio = await prisma.portfolioItem.findMany({
            where: { userId: session.user.id },
            select: { ticker: true, quantity: true, avgPrice: true }
        });

        // Transform to format expected by frontend { ticker: quantity } (simple) 
        // or { ticker: { quantity, avgPrice } } (complex)
        // The current frontend uses Record<string, number> (ticker -> quantity)

        const holdings: Record<string, number> = {};
        const details: Record<string, { quantity: number, avgPrice: number | null }> = {};

        portfolio.forEach(item => {
            holdings[item.ticker] = item.quantity;
            details[item.ticker] = { quantity: item.quantity, avgPrice: item.avgPrice };
        });

        return NextResponse.json({
            holdings,
            details // valid JSON, extra fields ignored if not used
        });
    } catch (error) {
        console.error('Error fetching portfolio:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    const session = await auth();

    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const body = await req.json();
        const { action, ticker, quantity, holdings } = body;

        // Bulk sync
        if (action === 'sync' && holdings) {
            for (const [t, q] of Object.entries(holdings)) {
                if (typeof q === 'number') {
                    await prisma.portfolioItem.upsert({
                        where: { userId_ticker: { userId: session.user.id, ticker: t } },
                        update: { quantity: q },
                        create: { userId: session.user.id, ticker: t, quantity: q }
                    });
                }
            }
            return NextResponse.json({ success: true });
        }

        if (!ticker) {
            return NextResponse.json({ error: 'Ticker required' }, { status: 400 });
        }

        if (action === 'update' || action === 'add') {
            if (typeof quantity !== 'number') {
                return NextResponse.json({ error: 'Quantity required' }, { status: 400 });
            }

            await prisma.portfolioItem.upsert({
                where: { userId_ticker: { userId: session.user.id, ticker } },
                update: { quantity },
                create: { userId: session.user.id, ticker, quantity }
            });
        } else if (action === 'remove') {
            await prisma.portfolioItem.deleteMany({
                where: { userId: session.user.id, ticker }
            });
        } else {
            return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error updating portfolio:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
