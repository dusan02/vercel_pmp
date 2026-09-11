import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getEarningsRange } from '@/lib/seo/earningsSSR';

function toETDateString(date: Date): string {
  return date.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

function formatDateDisplay(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00Z');
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

function formatRevenue(value: number | null): string {
  if (value == null) return '-';
  if (value >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
  if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(0)}M`;
  return `$${value.toFixed(0)}`;
}

function formatEps(value: number | null): string {
  if (value == null) return '-';
  return `$${value.toFixed(2)}`;
}

function formatPercent(value: number | null): string {
  if (value == null) return '-';
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
}

/**
 * Generate a weekly "Earnings This Week" blog post.
 * Stores it as a DailyBlogSnapshot with a special date key "weekly-YYYY-MM-DD".
 * The blog page renders these alongside daily snapshots.
 */
export async function POST(request: NextRequest) {
  const apiKey = request.headers.get('x-api-key');
  const validKey = process.env.CRON_SECRET || process.env.BLOG_API_KEY;
  if (!validKey) {
    return NextResponse.json({ error: 'Auth not configured' }, { status: 503 });
  }
  if (apiKey !== validKey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const todayET = toETDateString(new Date());
    const today = new Date(todayET + 'T12:00:00Z');
    const end = new Date(today);
    end.setUTCDate(end.getUTCDate() + 7);
    const endStr = end.toISOString().split('T')[0] ?? '';

    // Fetch earnings for the next 7 days
    const groups = await getEarningsRange(todayET, endStr);
    const totalEarnings = groups.reduce((sum, g) => sum + g.total, 0);
    const allRows = groups.flatMap((g) => [...g.preMarket, ...g.afterMarket, ...g.timeTbd]);
    const withEstimates = allRows.filter((r) => r.epsEstimate != null);
    const reportedCount = allRows.filter((r) => r.hasReported).length;

    // Build blog content
    const weekStart = todayET;
    const weekEnd = endStr;
    const blogKey = `weekly-${weekStart}`;

    // Build overview text
    const overview = {
      type: 'weekly-earnings',
      title: `Earnings This Week: ${formatDateDisplay(weekStart)} – ${formatDateDisplay(weekEnd)}`,
      summary: `${totalEarnings} earnings scheduled this week. ${withEstimates.length} with EPS estimates. ${reportedCount} already reported.`,
      weekStart,
      weekEnd,
      totalEarnings,
      withEstimates: withEstimates.length,
      reportedCount,
    };

    // Build day-by-day breakdown
    const dayBreakdown = groups.map((g) => ({
      date: g.date,
      total: g.total,
      preMarket: g.preMarket.length,
      afterMarket: g.afterMarket.length,
      timeTbd: g.timeTbd.length,
      notable: [...g.preMarket, ...g.afterMarket, ...g.timeTbd]
        .filter((r) => r.epsEstimate != null)
        .slice(0, 5)
        .map((r) => ({
          ticker: r.ticker,
          companyName: r.companyName,
          time: r.time,
          epsEstimate: r.epsEstimate,
          revenueEstimate: r.revenueEstimate,
          epsActual: r.epsActual,
          epsSurprisePercent: r.epsSurprisePercent,
          hasReported: r.hasReported,
        })),
    }));

    // Build gainers/losers/mcap from current ticker data (reuse daily snapshot logic)
    const tickers = await prisma.ticker.findMany({
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

    const gainers = [...tickers]
      .filter((t) => t.lastChangePct != null)
      .sort((a, b) => (b.lastChangePct ?? 0) - (a.lastChangePct ?? 0))
      .slice(0, 10)
      .map((t) => ({
        ticker: t.symbol,
        name: t.name,
        price: t.lastPrice,
        percentChange: t.lastChangePct,
        marketCap: t.lastMarketCap,
      }));

    const losers = [...tickers]
      .filter((t) => t.lastChangePct != null)
      .sort((a, b) => (a.lastChangePct ?? 0) - (b.lastChangePct ?? 0))
      .slice(0, 10)
      .map((t) => ({
        ticker: t.symbol,
        name: t.name,
        price: t.lastPrice,
        percentChange: t.lastChangePct,
        marketCap: t.lastMarketCap,
      }));

    const mcapMovers = [...tickers]
      .filter((t) => t.lastMarketCapDiff != null && Math.abs(t.lastMarketCapDiff ?? 0) > 0)
      .sort((a, b) => Math.abs(b.lastMarketCapDiff ?? 0) - Math.abs(a.lastMarketCapDiff ?? 0))
      .slice(0, 10)
      .map((t) => ({
        ticker: t.symbol,
        name: t.name,
        marketCap: t.lastMarketCap,
        marketCapDiff: t.lastMarketCapDiff,
      }));

    // Build earnings JSON with weekly summary
    const earningsJson = JSON.stringify({
      type: 'weekly',
      overview,
      dayBreakdown,
      totalEarnings,
      withEstimates: withEstimates.length,
    });

    // Upsert the weekly blog snapshot
    await prisma.dailyBlogSnapshot.upsert({
      where: { date: blogKey },
      update: {
        gainersJson: JSON.stringify(gainers),
        losersJson: JSON.stringify(losers),
        mcapMoversJson: JSON.stringify(mcapMovers),
        overviewJson: JSON.stringify(overview),
        earningsJson,
      },
      create: {
        date: blogKey,
        gainersJson: JSON.stringify(gainers),
        losersJson: JSON.stringify(losers),
        mcapMoversJson: JSON.stringify(mcapMovers),
        overviewJson: JSON.stringify(overview),
        earningsJson,
      },
    });

    console.log(`[Earnings Blog] Generated weekly earnings blog for ${weekStart} → ${weekEnd}: ${totalEarnings} earnings`);

    return NextResponse.json({
      success: true,
      blogKey,
      totalEarnings,
      withEstimates: withEstimates.length,
      reportedCount,
    });
  } catch (error: any) {
    console.error('[Earnings Blog] Error:', error);
    return NextResponse.json({ error: 'Failed to generate earnings blog', details: error.message }, { status: 500 });
  }
}
