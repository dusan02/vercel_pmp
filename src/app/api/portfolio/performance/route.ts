import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getCachedData, setCachedData } from '@/lib/redis/operations';
import crypto from 'crypto';

const MAX_TICKERS = 50;
const MAX_QUANTITY = 1_000_000;
const CACHE_TTL = 1800; // 30 min — DVH updates once a day

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/portfolio/performance?h=NVDA:10,AAPL:5&days=380
 *
 * "What-if" performance of the *current* holdings weights vs SPY.
 * Returns %-normalized series anchored at 0 so both lines are comparable.
 */
export async function GET(req: NextRequest) {
    try {
        const raw = req.nextUrl.searchParams.get('h') || '';
        const days = Math.min(Math.max(parseInt(req.nextUrl.searchParams.get('days') || '380', 10) || 380, 30), 1900);

        const holdings = new Map<string, number>();
        for (const part of raw.split(',')) {
            const m = part.trim().match(/^([A-Za-z.]{1,10})(?::([0-9.]+))?$/);
            if (!m || !m[1]) continue;
            const t = m[1].toUpperCase();
            holdings.set(t, Math.min(parseFloat(m[2] || '1') || 1, MAX_QUANTITY));
            if (holdings.size >= MAX_TICKERS) break;
        }
        if (holdings.size === 0) {
            return NextResponse.json({ error: 'No valid holdings' }, { status: 400 });
        }

        const cacheKey = `portfolio:perf:v1:${crypto.createHash('md5').update(`${[...holdings.entries()].sort().join(',')}|${days}`).digest('hex')}`;
        try {
            const cached = await getCachedData(cacheKey);
            if (cached) return NextResponse.json(cached);
        } catch {}

        const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
        const symbols = [...holdings.keys(), 'SPY'];
        const rows = await prisma.dailyValuationHistory.findMany({
            where: { symbol: { in: symbols }, date: { gte: from }, closePrice: { not: null, gt: 0 } },
            select: { symbol: true, date: true, closePrice: true },
            orderBy: { date: 'asc' },
        });

        const bySym = new Map<string, { t: number; c: number }[]>();
        for (const r of rows) {
            const arr = bySym.get(r.symbol) || [];
            arr.push({ t: r.date.getTime(), c: r.closePrice! });
            bySym.set(r.symbol, arr);
        }
        const spy = bySym.get('SPY') || [];
        if (spy.length < 2) {
            return NextResponse.json({ error: 'Benchmark data unavailable' }, { status: 503 });
        }

        // Union of all dates; portfolio value uses last known close per symbol (forward-fill)
        const allDates = [...new Set(rows.map(r => r.date.getTime()))].sort((a, b) => a - b);
        const idx = new Map<string, number>();
        const last = new Map<string, number>();
        const series: { date: string; portfolio: number; spy: number }[] = [];
        let firstVal: number | null = null;
        const spyBase = spy[0]!.c;
        let spyI = 0;

        for (const t of allDates) {
            for (const [sym] of holdings) {
                const arr = bySym.get(sym);
                if (!arr) continue;
                let i = idx.get(sym) || 0;
                while (i < arr.length && arr[i]!.t <= t) { last.set(sym, arr[i]!.c); i++; }
                idx.set(sym, i);
            }
            let val = 0;
            let any = false;
            for (const [sym, qty] of holdings) {
                const c = last.get(sym);
                if (c !== undefined) { val += qty * c; any = true; }
            }
            while (spyI < spy.length && spy[spyI]!.t <= t) spyI++;
            if (!any || spyI === 0) continue;
            if (firstVal === null) firstVal = val;
            series.push({
                date: new Date(t).toISOString().slice(0, 10),
                portfolio: (val / firstVal - 1) * 100,
                spy: (spy[spyI - 1]!.c / spyBase - 1) * 100,
            });
        }

        if (series.length < 2) {
            return NextResponse.json({ error: 'Insufficient history' }, { status: 404 });
        }

        const lastPoint = series[series.length - 1]!;
        const payload = { series, currentValue: firstVal !== null ? firstVal * (1 + lastPoint.portfolio / 100) : 0 };
        try { await setCachedData(cacheKey, payload, CACHE_TTL); } catch {}
        return NextResponse.json(payload);
    } catch (e) {
        console.error('❌ portfolio performance error:', e);
        return NextResponse.json({ error: 'Failed to compute performance' }, { status: 500 });
    }
}
