/**
 * One-off audit: compare stored FinnhubMetrics rows against a fresh live
 * Finnhub /stock/metric fetch (same mapping code) + Ticker.lastPrice vs
 * /quote. Run on the VPS where both the DB and the API key live:
 *   npx tsx scripts/__audit-metrics-vs-finnhub.ts [--n=20]
 */
import { loadEnvFromFiles } from './_utils/loadEnv';
loadEnvFromFiles();

import { prisma } from '../src/lib/db/prisma';
import { getFinnhubClient } from '../src/lib/clients/finnhubClient';
import type { FinnhubMetric } from '../src/lib/clients/finnhubClient';

const N = parseInt(process.argv.find((a) => a.startsWith('--n='))?.split('=')[1] ?? '20', 10);

const FIELDS: (keyof FinnhubMetric)[] = [
    'peRatio', 'forwardPe', 'pbRatio', 'psRatio', 'pegRatio', 'evEbitda', 'evSales',
    'priceCashFlow', 'priceFreeCashFlow', 'grossMargin', 'operatingMargin', 'netMargin',
    'roe', 'roa', 'roic', 'rote', 'revenueGrowth', 'earningsGrowth', 'bookValueGrowth',
    'debtGrowth', 'currentRatio', 'quickRatio', 'debtEquityRatio', 'interestCoverage',
    'totalDebtToCapitalization', 'beta', 'dividendYield', 'payoutRatio',
];

function fmt(v: number | null | undefined): string {
    return v == null ? 'null' : v.toFixed(3);
}

async function main() {
    const rows = await prisma.finnhubMetrics.findMany({
        where: { ticker: { lastPrice: { gt: 0 } } },
        include: { ticker: { select: { lastPrice: true } } },
    });
    // random sample
    const sample = rows.sort(() => Math.random() - 0.5).slice(0, N);
    console.log(`📊 Auditing ${sample.length} tickers against live Finnhub\n`);

    const client = getFinnhubClient();
    let totalDiffs = 0;
    let symbolsWithDiffs = 0;

    for (const row of sample) {
        const sym = row.symbol;
        const live = await client.fetchMetrics(sym);
        if (!live) {
            console.log(`${sym.padEnd(6)} — fetch failed`);
            continue;
        }
        const diffs: string[] = [];
        for (const f of FIELDS) {
            const db = (row as any)[f] as number | null;
            const lv = (live as any)[f] as number | null;
            if (db == null && lv == null) continue;
            if (db != null && lv != null) {
                // ratios drift with the live price between resync and audit —
                // allow 2% relative or 0.02 absolute tolerance
                const tol = Math.max(Math.abs(db) * 0.02, 0.02);
                if (Math.abs(db - lv) <= tol) continue;
            }
            diffs.push(`${f}: db=${fmt(db)} live=${fmt(lv)}`);
        }
        // price check vs /quote
        const quote = await client.fetchQuote(sym).catch(() => null);
        const priceDb = row.ticker?.lastPrice ?? null;
        const priceLive = quote?.c ?? null;
        const priceNote = (priceDb != null && priceLive != null)
            ? (Math.abs(priceDb - priceLive) / priceLive > 0.005 ? ` ⚠️ price db=${priceDb} live=${priceLive}` : '')
            : '';
        if (diffs.length === 0) {
            console.log(`${sym.padEnd(6)} ✅ all ${FIELDS.length} fields match${priceNote}`);
        } else {
            symbolsWithDiffs++;
            totalDiffs += diffs.length;
            console.log(`${sym.padEnd(6)} ❌ ${diffs.length} diffs${priceNote}`);
            for (const d of diffs) console.log(`        ${d}`);
        }
        await new Promise((r) => setTimeout(r, 1300)); // ~45/min, safe for free tier
    }
    console.log(`\n=== ${symbolsWithDiffs}/${sample.length} symbols with diffs, ${totalDiffs} total field diffs ===`);
    await prisma.$disconnect();
    process.exit(0); // open redis/prisma handles would keep the loop alive
}

main().catch((e) => { console.error(e); process.exit(1); });
