import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';

const DRAW_KINDS = new Set(['measure', 'trend', 'ray', 'hline', 'zone', 'fibo']);
const MAX_DRAWINGS = 20; // mirrors the client-side cap in saveDrawings

function validDrawings(v: unknown): { kind: string; a: { date: string; v: number }; b: { date: string; v: number } }[] | null {
    if (!Array.isArray(v) || v.length > MAX_DRAWINGS) return null;
    for (const d of v) {
        if (!d || typeof d !== 'object') return null;
        const o = d as any;
        if (!DRAW_KINDS.has(o.kind)) return null;
        if (typeof o.a?.date !== 'string' || o.a.date.length > 10) return null;
        if (typeof o.b?.date !== 'string' || o.b.date.length > 10) return null;
        if (typeof o.a?.v !== 'number' || typeof o.b?.v !== 'number') return null;
        if (!Number.isFinite(o.a.v) || !Number.isFinite(o.b.v)) return null;
    }
    return v as any;
}

// GET /api/user/drawings?ticker=LRCX — the user's saved drawing set for one
// ticker. 401 keeps the client on its localStorage copy (anonymous users).
export async function GET(req: NextRequest) {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const ticker = (req.nextUrl.searchParams.get('ticker') || '').toUpperCase().trim();
    if (!ticker || ticker.length > 10) {
        return NextResponse.json({ error: 'ticker required' }, { status: 400 });
    }
    const row = await prisma.chartDrawing.findUnique({
        where: { userId_ticker: { userId: session.user.id, ticker } },
        select: { data: true, updatedAt: true },
    });
    let drawings: unknown[] = [];
    try { drawings = row ? JSON.parse(row.data) : []; } catch { drawings = []; }
    return NextResponse.json({ drawings, updatedAt: row?.updatedAt ?? null });
}

// POST { ticker, drawings[] } — replaces the whole set for the ticker.
// An empty array deletes the row (keeps the table clean of dead saves).
export async function POST(req: NextRequest) {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    try {
        const body = await req.json().catch(() => null) as { ticker?: unknown; drawings?: unknown } | null;
        const ticker = typeof body?.ticker === 'string' ? body.ticker.toUpperCase().trim() : '';
        if (!ticker || ticker.length > 10) {
            return NextResponse.json({ error: 'ticker required' }, { status: 400 });
        }
        const drawings = validDrawings(body?.drawings);
        if (drawings === null) {
            return NextResponse.json({ error: 'invalid drawings' }, { status: 400 });
        }
        if (drawings.length === 0) {
            await prisma.chartDrawing.deleteMany({
                where: { userId: session.user.id, ticker },
            });
        } else {
            await prisma.chartDrawing.upsert({
                where: { userId_ticker: { userId: session.user.id, ticker } },
                update: { data: JSON.stringify(drawings) },
                create: { userId: session.user.id, ticker, data: JSON.stringify(drawings) },
            });
        }
        return NextResponse.json({ success: true, count: drawings.length });
    } catch (error) {
        console.error('Error saving drawings:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
