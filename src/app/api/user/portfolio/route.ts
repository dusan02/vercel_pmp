
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';

export async function GET(req: NextRequest) {
    try {
        const session = await auth();

        if (!session?.user?.id) {
            // Return empty portfolio for unauthenticated users (not an error)
            return NextResponse.json({
                holdings: {},
                details: {}
            });
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
        } catch (dbError) {
            console.error('❌ Error fetching portfolio from DB:', dbError);
            // Return empty portfolio instead of 500 error
            return NextResponse.json({
                holdings: {},
                details: {},
                error: 'Database error (portfolio unavailable)'
            });
        }
    } catch (authError) {
        console.error('❌ Error in portfolio GET (auth):', authError);
        // Return empty portfolio instead of 500 error
        return NextResponse.json({
            holdings: {},
            details: {},
            error: 'Authentication error (portfolio unavailable)'
        });
    }
}

export async function POST(req: NextRequest) {
    try {
        const session = await auth();

        if (!session?.user?.id) {
            // For unauthenticated users, silently fail (portfolio is stored locally)
            return NextResponse.json({ success: true, message: 'Not authenticated, using local storage only' });
        }

        try {
            const body = await req.json();
            const { action, ticker, quantity, holdings } = body;

            // Bulk sync
            if (action === 'sync' && holdings) {
                for (const [t, q] of Object.entries(holdings)) {
                    if (typeof q === 'number') {
                        try {
                            await prisma.portfolioItem.upsert({
                                where: { userId_ticker: { userId: session.user.id, ticker: t } },
                                update: { quantity: q },
                                create: { userId: session.user.id, ticker: t, quantity: q }
                            });
                        } catch (itemError) {
                            console.warn(`⚠️ Failed to upsert portfolio item ${t}:`, itemError);
                            // Continue with other items
                        }
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
        } catch (dbError) {
            console.error('❌ Error updating portfolio in DB:', dbError);
            // Return success but log error (frontend can fallback to localStorage)
            return NextResponse.json({ 
                success: false, 
                error: 'Database error',
                message: 'Portfolio update failed, using local storage only'
            });
        }
    } catch (authError) {
        console.error('❌ Error in portfolio POST (auth):', authError);
        // Return success for unauthenticated users (they use localStorage)
        return NextResponse.json({ 
            success: true, 
            message: 'Not authenticated, using local storage only' 
        });
    }
}
