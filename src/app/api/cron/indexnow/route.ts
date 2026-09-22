/**
 * POST /api/cron/indexnow — submits fresh URLs to IndexNow (Bing/Yandex).
 *
 * Runs after the regular session close so the day's archive pages
 * (/premarket-gainers/[date], /premarket-losers/[date]) get indexed the same
 * day — they rank ~pos 5 for date queries and stale indexing wastes that.
 *
 * Optional body: { "urls": [...] } to submit explicit URLs instead.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyCronAuth } from '@/lib/utils/cronAuth';
import { submitToIndexNow } from '@/lib/seo/indexnow';
import { getDateET } from '@/lib/redis/ranking';
import { prisma } from '@/lib/db/prisma';

const BASE = 'https://premarketprice.com';

async function buildDailyUrls(): Promise<string[]> {
  const date = getDateET();
  const urls = [
    `${BASE}/premarket-gainers/${date}`,
    `${BASE}/premarket-losers/${date}`,
    `${BASE}/premarket-gainers`,
    `${BASE}/premarket-losers`,
    `${BASE}/premarket-movers`,
    `${BASE}/gainers`,
    `${BASE}/losers`,
  ];

  // Today's significant pre-market movers — their insight + analysis pages
  try {
    const dayStart = new Date(date + 'T00:00:00Z');
    const dayEnd = new Date(date + 'T23:59:59Z');
    const movers = await prisma.sessionPrice.findMany({
      where: {
        session: 'pre',
        date: { gte: dayStart, lte: dayEnd },
        OR: [{ zScore: { gte: 2.0 } }, { zScore: { lte: -2.0 } }],
      },
      select: { symbol: true },
      orderBy: { changePct: 'desc' },
      take: 40,
    });
    for (const m of movers) {
      urls.push(`${BASE}/premarket/${m.symbol}`, `${BASE}/analysis/${m.symbol}`);
    }

    // Recently refreshed/new analyses — their analysis + valuation +
    // financials pages changed, so Bing should re-crawl them. New tickers
    // (added to the universe) surface here on their first AnalysisCache row.
    const recent = await prisma.analysisCache.findMany({
      where: { updatedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
      select: { symbol: true },
      orderBy: { updatedAt: 'desc' },
      take: 60,
    });
    for (const r of recent) {
      urls.push(
        `${BASE}/analysis/${r.symbol}`,
        `${BASE}/valuation/${r.symbol}`,
        `${BASE}/financials/${r.symbol}`,
      );
    }
  } catch {
    // DB unavailable — submit the core URLs only
  }

  return urls;
}

export async function POST(request: NextRequest) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;

  let urls: string[] | null = null;
  try {
    const body = await request.json();
    if (Array.isArray(body?.urls)) urls = body.urls;
  } catch {
    // no body — build the daily set
  }

  const list = urls ?? (await buildDailyUrls());
  const result = await submitToIndexNow(list);

  return NextResponse.json({ ...result, urls: list.slice(0, 20) });
}
