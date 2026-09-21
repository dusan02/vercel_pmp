/**
 * Sync Finnhub analyst recommendations + insider transactions for all tracked tickers.
 * Fills FinnhubRecommendation (latest period) and FinnhubInsiderTransaction
 * (last ~15 filings per symbol) so /analysis/[ticker] can render the
 * consensus bar and insider activity sections.
 *
 * NOTE: /stock/price-target returns 403 on the current Finnhub tier — only
 * the two accessible endpoints are synced here.
 *
 * Run: npx tsx scripts/sync-finnhub-sentiment.ts [--force] [--limit=50]
 * Cron: daily at 04:30 UTC via PM2 (after metrics sync at 03:00)
 */
import { loadEnvFromFiles } from './_utils/loadEnv';

loadEnvFromFiles();

import { prisma } from '../src/lib/db/prisma';
import { FINNHUB_API_KEY } from '../src/lib/clients/finnhubClient';

const INSIDER_KEEP = 15;

interface RecommendationRow {
  period?: string;
  strongBuy?: number;
  buy?: number;
  hold?: number;
  sell?: number;
  strongSell?: number;
}

interface InsiderRow {
  change?: number;
  filingDate?: string;
  transactionDate?: string;
  transactionCode?: string;
}

async function fetchJson(url: string): Promise<unknown | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function syncSymbol(symbol: string): Promise<{ rec: boolean; insider: boolean }> {
  const result = { rec: false, insider: false };

  // Analyst recommendations — latest period only
  const recData = await fetchJson(
    `https://finnhub.io/api/v1/stock/recommendation?symbol=${symbol}&token=${FINNHUB_API_KEY}`,
  );
  const latest = Array.isArray(recData) ? (recData[0] as RecommendationRow | undefined) : undefined;
  if (latest && (latest.strongBuy != null || latest.buy != null || latest.hold != null)) {
    await prisma.finnhubRecommendation.upsert({
      where: { symbol },
      create: {
        symbol,
        period: latest.period ?? null,
        strongBuy: latest.strongBuy ?? null,
        buy: latest.buy ?? null,
        hold: latest.hold ?? null,
        sell: latest.sell ?? null,
        strongSell: latest.strongSell ?? null,
      },
      update: {
        period: latest.period ?? null,
        strongBuy: latest.strongBuy ?? null,
        buy: latest.buy ?? null,
        hold: latest.hold ?? null,
        sell: latest.sell ?? null,
        strongSell: latest.strongSell ?? null,
      },
    });
    result.rec = true;
  }

  // Insider transactions — replace snapshot with the latest filings
  const insiderData = await fetchJson(
    `https://finnhub.io/api/v1/stock/insider-transactions?symbol=${symbol}&token=${FINNHUB_API_KEY}`,
  ) as { data?: InsiderRow[] } | null;
  const rows = Array.isArray(insiderData?.data)
    ? insiderData!.data!
        .filter(r => r.transactionDate && r.change != null)
        .slice(0, INSIDER_KEEP)
    : [];
  if (insiderData?.data) {
    await prisma.finnhubInsiderTransaction.deleteMany({ where: { symbol } });
    if (rows.length > 0) {
      await prisma.finnhubInsiderTransaction.createMany({
        data: rows.map(r => ({
          symbol,
          change: r.change!,
          filingDate: r.filingDate ?? '',
          transactionDate: r.transactionDate!,
          transactionCode: r.transactionCode ?? '?',
        })),
      });
    }
    result.insider = true;
  }

  return result;
}

async function main() {
  const forceRefresh = process.argv.includes('--force');
  const limitArg = process.argv.find(a => a.startsWith('--limit='));
  const limit = limitArg ? parseInt(limitArg.split('=')[1] ?? '0', 10) : undefined;

  if (!FINNHUB_API_KEY) {
    console.error('❌ FINNHUB_API_KEY missing');
    process.exit(1);
  }

  console.log(`🔄 sync-finnhub-sentiment starting (force=${forceRefresh}, limit=${limit ?? 'all'})`);

  const tickers = await prisma.ticker.findMany({
    where: { lastPrice: { gt: 0 } },
    select: { symbol: true },
    orderBy: { lastMarketCap: 'desc' },
    ...(limit ? { take: limit } : {}),
  });
  const symbols = tickers.map(t => t.symbol).filter((s): s is string => !!s);
  console.log(`📊 ${symbols.length} tickers to sync`);

  // 2 calls per ticker; ~2.1s spacing keeps us under the 60 calls/min free tier.
  const DELAY_MS = 2100;
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  let recOk = 0, insiderOk = 0, skipped = 0, failed = 0;

  let idx = 0;
  for (const symbol of symbols) {
    try {
      if (!forceRefresh) {
        const existing = await prisma.finnhubRecommendation.findUnique({
          where: { symbol },
          select: { fetchedAt: true },
        });
        if (existing?.fetchedAt && existing.fetchedAt > dayAgo) {
          skipped++;
          idx++;
          continue;
        }
      }

      const r = await syncSymbol(symbol);
      if (r.rec) recOk++;
      if (r.insider) insiderOk++;
      if (!r.rec && !r.insider) failed++;
    } catch {
      failed++;
    }

    idx++;
    if (idx % 50 === 0) {
      console.log(`📈 ${idx}/${symbols.length} — rec:${recOk} insider:${insiderOk} skipped:${skipped} failed:${failed}`);
    }
    if (idx < symbols.length) {
      await new Promise(resolve => setTimeout(resolve, DELAY_MS));
    }
  }

  console.log(`✅ Done: rec=${recOk}, insider=${insiderOk}, skipped=${skipped}, failed=${failed}`);
  await prisma.$disconnect();
  // Explicit exit — an open Redis handle would otherwise keep the process
  // alive for hours after the sync finished (observed zombie PM2 processes).
  process.exit(0);
}

main().catch((e) => {
  console.error('❌ sync-finnhub-sentiment failed:', e);
  prisma.$disconnect();
  process.exit(1);
});
