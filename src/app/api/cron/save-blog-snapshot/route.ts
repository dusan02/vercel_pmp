import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getFinnhubClient } from '@/lib/clients/finnhubClient';
import { getProjectTickers } from '@/data/defaultTickers';

function toETDateString(date: Date): string {
  return date.toLocaleDateString('en-CA', { timeZone: 'America/New_York' }); // "2026-05-30"
}

interface TickerSnapshot {
  ticker: string;
  name: string | null;
  price: number;
  percentChange: number;
  marketCapDiff: number;
  marketCap: number;
}

interface EarningsItem {
  ticker: string;
  name: string | null;
  epsEstimate: number | null;
  revenueEstimate: number | null;
  hour: string;
}

export async function POST(request: NextRequest) {
  const apiKey = request.headers.get('x-api-key');
  const validKey = process.env.CRON_SECRET || process.env.BLOG_API_KEY || 'dev-key-12345';
  if (apiKey !== validKey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const dateStr = toETDateString(new Date());

    // 1. Fetch stock data from DB (Ticker table)
    type RawTicker = { symbol: string; name: string | null; lastPrice: number | null; lastChangePct: number | null; lastMarketCap: number | null; lastMarketCapDiff: number | null };
    const tickers: RawTicker[] = await prisma.ticker.findMany({
      where: { lastPrice: { gt: 0 } },
      select: {
        symbol: true,
        name: true,
        lastPrice: true,
        lastChangePct: true,
        lastMarketCap: true,
        lastMarketCapDiff: true,
      },
    });

    if (tickers.length === 0) {
      return NextResponse.json({ error: 'No ticker data available' }, { status: 404 });
    }

    const stocks: TickerSnapshot[] = tickers
      .filter((t: RawTicker) => t.lastChangePct !== null && t.lastChangePct !== 0)
      .map((t: RawTicker) => ({
        ticker: t.symbol,
        name: t.name,
        price: t.lastPrice ?? 0,
        percentChange: t.lastChangePct ?? 0,
        marketCapDiff: t.lastMarketCapDiff ?? 0,
        marketCap: t.lastMarketCap ?? 0,
      }));

    const totalStocks = stocks.length;
    const gainers = stocks.filter(s => s.percentChange > 0).length;
    const losers = stocks.filter(s => s.percentChange < 0).length;
    const avgChange = stocks.reduce((sum, s) => sum + s.percentChange, 0) / totalStocks;
    const totalMcapChange = stocks.reduce((sum, s) => sum + s.marketCapDiff, 0);
    let sentiment = 'Mixed';
    if (gainers > losers * 1.4) sentiment = 'Bullish';
    else if (losers > gainers * 1.4) sentiment = 'Bearish';

    const topGainers = stocks
      .filter(s => s.percentChange > 0)
      .sort((a, b) => b.percentChange - a.percentChange)
      .slice(0, 10);

    const topLosers = stocks
      .filter(s => s.percentChange < 0)
      .sort((a, b) => a.percentChange - b.percentChange)
      .slice(0, 10);

    const mcapMovers = stocks
      .filter(s => Math.abs(s.marketCapDiff) >= 1)
      .sort((a, b) => Math.abs(b.marketCapDiff) - Math.abs(a.marketCapDiff))
      .slice(0, 10);

    // 2. Fetch earnings from Finnhub for today
    let earningsData: EarningsItem[] = [];
    try {
      const finnhub = getFinnhubClient();
      const ourTickers = new Set(getProjectTickers('pmp'));
      const resp = await finnhub.fetchEarningsCalendar(dateStr, dateStr);
      if (resp?.earningsCalendar) {
        earningsData = resp.earningsCalendar
          .filter(e => ourTickers.has(e.symbol))
          .map(e => ({
            ticker: e.symbol,
            name: tickers.find((t: RawTicker) => t.symbol === e.symbol)?.name ?? null,
            epsEstimate: e.epsEstimate ?? null,
            revenueEstimate: e.revenueEstimate ?? null,
            hour: e.time ?? 'amc',
          }));
      }
    } catch (e) {
      console.warn('Finnhub earnings fetch failed, continuing without:', e);
    }

    // 3. Upsert snapshot
    await prisma.dailyBlogSnapshot.upsert({
      where: { date: dateStr },
      create: {
        date: dateStr,
        gainersJson: JSON.stringify(topGainers),
        losersJson: JSON.stringify(topLosers),
        mcapMoversJson: JSON.stringify(mcapMovers),
        overviewJson: JSON.stringify({ totalStocks, gainers, losers, avgChange, totalMcapChange, sentiment }),
        earningsJson: JSON.stringify(earningsData),
      },
      update: {
        gainersJson: JSON.stringify(topGainers),
        losersJson: JSON.stringify(topLosers),
        mcapMoversJson: JSON.stringify(mcapMovers),
        overviewJson: JSON.stringify({ totalStocks, gainers, losers, avgChange, totalMcapChange, sentiment }),
        earningsJson: JSON.stringify(earningsData),
      },
    });

    return NextResponse.json({ success: true, date: dateStr, stocks: totalStocks, earnings: earningsData.length });
  } catch (error) {
    console.error('Blog snapshot error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ info: 'POST with x-api-key header to save today\'s blog snapshot' });
}
