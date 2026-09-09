
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';

export async function GET(req: NextRequest) {
    const session = await auth();

    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const favorites = await prisma.userFavorite.findMany({
            where: { userId: session.user.id },
            select: { ticker: true }
        });

        return NextResponse.json({
            favorites: favorites.map(f => f.ticker)
        });
    } catch (error) {
        console.error('Error fetching favorites:', error);
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
        const { action, ticker, favorites } = body;

        // Bulk sync (migration from local storage)
        if (action === 'sync' && Array.isArray(favorites)) {
            // Upsert all favorites
            // Note: This is not efficient for large lists but fine for <100 favorites
            for (const t of favorites) {
                await prisma.userFavorite.upsert({
                    where: {
                        userId_ticker: {
                            userId: session.user.id,
                            ticker: t
                        }
                    },
                    update: {},
                    create: {
                        userId: session.user.id,
                        ticker: t
                    }
                });
            }
            return NextResponse.json({ success: true });
        }

        if (!ticker) {
            return NextResponse.json({ error: 'Ticker required' }, { status: 400 });
        }

        if (action === 'add') {
            await prisma.userFavorite.upsert({
                where: {
                    userId_ticker: {
                        userId: session.user.id,
                        ticker
                    }
                },
                update: {},
                create: {
                    userId: session.user.id,
                    ticker
                }
            });
        } else if (action === 'remove') {
            await prisma.userFavorite.deleteMany({
                where: {
                    userId: session.user.id,
                    ticker
                }
            });
        } else {
            return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error updating favorites:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
