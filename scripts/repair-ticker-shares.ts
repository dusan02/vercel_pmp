/**
 * Repair Ticker.sharesOutstanding rows where Polygon's
 * weighted_shares_outstanding diverges from the true class count.
 *
 * Background: Ticker.sharesOutstanding is written from
 * weighted_shares_outstanding — a trailing average that can sit at a stale
 * ~2x level after splits/buybacks (APH 2466M vs 1233M actual, MNST 1959M vs
 * 980M, IESC 42M vs 20M, VMRK 774M vs 375M). share_class_shares_outstanding
 * is the current class count but can omit sibling classes (DELL Class A,
 * RKT Class D, COKE Class B). When the two diverge >15%, the latest
 * SEC-derived FinancialStatement share count is the arbiter — whichever
 * candidate is closer wins.
 *
 * Also repairs lastMarketCap = lastPrice × corrected shares.
 *
 * After running, re-run repair-valuation-split-artifacts.ts for every
 * changed symbol — DVH rows on/after the latest statement end used the
 * wrong trustedShares.
 *
 * Usage:
 *   npx tsx scripts/repair-ticker-shares.ts [--dry-run] [--symbols=APH,MNST]
 */
import { loadEnvFromFiles } from './_utils/loadEnv';

loadEnvFromFiles();

import { prisma } from '../src/lib/db/prisma';
import { dbWriteRetry as dbWrite } from '../src/lib/db/writeRetry';

const POLYGON_API_KEY = process.env.POLYGON_API_KEY;
const dryRun = process.argv.includes('--dry-run');
const symbolsArg = process.argv.find(a => a.startsWith('--symbols='));
const SYMBOL_LIST = symbolsArg
    ? symbolsArg.split('=')[1]!.split(',').map(s => s.trim().toUpperCase()).filter(Boolean)
    : null;

async function main() {
    if (!POLYGON_API_KEY) throw new Error('POLYGON_API_KEY missing');

    const tickers = await prisma.ticker.findMany({
        where: SYMBOL_LIST
            ? { symbol: { in: SYMBOL_LIST } }
            : { sharesOutstanding: { not: null, gt: 0 } },
        select: { symbol: true, sharesOutstanding: true, lastPrice: true, lastMarketCap: true },
        orderBy: { symbol: 'asc' },
    });
    console.log(`[shares] ${tickers.length} tickers ${dryRun ? '(DRY RUN)' : ''}`);

    let changed = 0;
    for (const t of tickers) {
        const res = await fetch(
            `https://api.polygon.io/v3/reference/tickers/${t.symbol}?apiKey=${POLYGON_API_KEY}`
        ).then(r => (r.ok ? r.json() : null)).then(j => j?.results ?? null).catch(() => null);
        if (!res) continue;

        const weighted: number | null = res.weighted_shares_outstanding || null;
        const shareClass: number | null = res.share_class_shares_outstanding || null;
        if (!weighted && !shareClass) continue;
        if (!weighted || !shareClass) continue; // nothing to arbitrate
        if (Math.abs(weighted - shareClass) / Math.max(weighted, shareClass) <= 0.15) continue;

        const stmt = await prisma.financialStatement.findFirst({
            where: { symbol: t.symbol, sharesOutstanding: { not: null } },
            orderBy: { endDate: 'desc' },
            select: { sharesOutstanding: true, fiscalPeriod: true, fiscalYear: true },
        });
        const s = stmt?.sharesOutstanding;
        if (!s || s <= 0) continue;

        const dW = Math.abs(weighted - s) / s;
        const dS = Math.abs(shareClass - s) / s;
        const pick = dS <= dW ? shareClass : weighted;
        if (pick === t.sharesOutstanding) continue;

        const rel = Math.abs(pick - (t.sharesOutstanding ?? 0)) / Math.max(pick, t.sharesOutstanding ?? pick);
        if (rel < 0.05) continue;

        const newMcap = t.lastPrice && t.lastPrice > 0 ? (t.lastPrice * pick) / 1e9 : null;
        console.log(
            `[shares] ${t.symbol}: ${(t.sharesOutstanding! / 1e6).toFixed(1)}M → ${(pick / 1e6).toFixed(1)}M` +
            ` (weighted=${(weighted / 1e6).toFixed(0)}M class=${(shareClass / 1e6).toFixed(0)}M stmt=${(s / 1e6).toFixed(0)}M ${stmt!.fiscalPeriod}${stmt!.fiscalYear})` +
            (newMcap ? ` mcap ${t.lastMarketCap?.toFixed(1)}B → ${newMcap.toFixed(1)}B` : '')
        );
        changed++;
        if (!dryRun) {
            await dbWrite(() => prisma.ticker.update({
                where: { symbol: t.symbol },
                data: {
                    sharesOutstanding: pick,
                    ...(newMcap != null ? { lastMarketCap: newMcap } : {}),
                },
            }), 'repairTickerShares.update');
        }
        await new Promise(r => setTimeout(r, 150)); // Polygon Starter rate headroom
    }

    console.log(`\n[shares] done: ${changed} tickers corrected ${dryRun ? '(dry-run)' : ''}`);
    if (!dryRun && changed > 0) {
        console.log(`Next: re-run repair-valuation-split-artifacts.ts --symbols=<changed> and flush analysis:history:* keys`);
    }
}

main()
    .then(() => process.exit(0))
    .catch(e => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());
