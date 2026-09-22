/**
 * Recompute per-ticker insider aggregates into InsiderAggregate.
 *
 * Signal scope (per SEC Form 4 code semantics):
 *   P = open-market/private purchase — the bullish signal
 *   S = open-market/private sale    — the bearish signal
 *   A/M/F/G/... are compensation/mechanical flows (grants, option exercises,
 *   tax withholding, gifts) — excluded from the ranking metrics entirely.
 *
 * Values use shares × transactionPrice at execution time (stored by the sync),
 * not current price. Rows without transactionPrice still count toward share
 * aggregates but not $ values.
 *
 * Windows: 90d for share/value aggregates, 14d for the unique-insider cluster
 * (cluster = distinct reporting persons, not transaction count — one insider
 * splitting an order into 20 fills is still one decision).
 *
 * Run: npx tsx scripts/compute-insider-aggregates.ts
 * Cron: PM2 `cron-insider-aggregates` (daily, after cron-finnhub-sentiment-sync)
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DAY = 24 * 60 * 60 * 1000;

async function main() {
  const now = new Date();
  const d90 = new Date(now.getTime() - 90 * DAY).toISOString().slice(0, 10);
  const d14 = new Date(now.getTime() - 14 * DAY).toISOString().slice(0, 10);

  const tickers = await prisma.ticker.findMany({
    where: { sharesOutstanding: { not: null } },
    select: { symbol: true, sharesOutstanding: true },
  });
  const sharesOut = new Map(tickers.map(t => [t.symbol, t.sharesOutstanding!]));

  const rows = await prisma.finnhubInsiderTransaction.findMany({
    where: {
      transactionDate: { gte: d90 },
      transactionCode: { in: ['P', 'S'] },
    },
    select: {
      symbol: true,
      transactionCode: true,
      transactionDate: true,
      change: true,
      transactionPrice: true,
      name: true,
    },
  });

  type Agg = {
    buyShares: number; sellShares: number;
    buyValue: number; sellValue: number;
    largestBuy: number; largestSell: number;
    buyers14d: Set<string>; sellers14d: Set<string>;
  };
  const bySymbol = new Map<string, Agg>();
  const agg = (s: string): Agg => {
    let a = bySymbol.get(s);
    if (!a) {
      a = {
        buyShares: 0, sellShares: 0, buyValue: 0, sellValue: 0,
        largestBuy: 0, largestSell: 0,
        buyers14d: new Set(), sellers14d: new Set(),
      };
      bySymbol.set(s, a);
    }
    return a;
  };

  for (const r of rows) {
    const a = agg(r.symbol);
    const shares = Math.abs(r.change);
    const value = r.transactionPrice != null ? shares * r.transactionPrice : null;
    const recent = r.transactionDate >= d14;

    if (r.transactionCode === 'P') {
      a.buyShares += shares;
      if (value != null) {
        a.buyValue += value;
        if (value > a.largestBuy) a.largestBuy = value;
      }
      if (recent && r.name) a.buyers14d.add(r.name);
    } else {
      a.sellShares += shares;
      if (value != null) {
        a.sellValue += value;
        if (value > a.largestSell) a.largestSell = value;
      }
      if (recent && r.name) a.sellers14d.add(r.name);
    }
  }

  let upserted = 0;
  for (const [symbol, a] of bySymbol) {
    const so = sharesOut.get(symbol);
    const netShares = a.buyShares - a.sellShares;
    const data = {
      netBuyShares90d: netShares,
      netBuyValue90d: a.buyValue - a.sellValue,
      netBuyPct90d: so ? netShares / so : null,
      buyShares90d: a.buyShares,
      sellShares90d: a.sellShares,
      buyValue90d: a.buyValue,
      sellValue90d: a.sellValue,
      largestBuyValue90d: a.largestBuy || null,
      largestSellValue90d: a.largestSell || null,
      uniqueBuyers14d: a.buyers14d.size,
      uniqueSellers14d: a.sellers14d.size,
      computedAt: now,
    };
    await prisma.insiderAggregate.upsert({
      where: { symbol },
      create: { symbol, ...data },
      update: data,
    });
    upserted++;
  }

  // Clear aggregates for tickers with no P/S rows in the window so stale
  // values don't linger after the window slides past their last transaction.
  const stale = await prisma.insiderAggregate.deleteMany({
    where: { symbol: { notIn: [...bySymbol.keys()] } },
  });

  console.log(`✅ Insider aggregates: ${upserted} tickers updated, ${stale.count} cleared (${rows.length} P/S rows in 90d window)`);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
