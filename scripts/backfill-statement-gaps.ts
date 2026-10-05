/**
 * Universe statement-gap backfill.
 *
 * Finds tickers whose latest quarterly FinancialStatement.endDate is older
 * than --before (default: 80 days ago) and drives each one through the
 * production refresh path — POST /api/analysis/[ticker] — which runs:
 *   syncFinancials (SA quarterly gap-fill + EBIT verify) → Finnhub metrics →
 *   syncValuationHistory → calculateScores → Redis purge + revalidatePath.
 *
 * That guarantees DB → compute → ISR invalidation happen atomically per
 * ticker, so repaired data is actually served (the PSX incident showed a
 * DB-only fix leaves stale ISR artifacts).
 *
 * After the run, repair the distorted DailyValuationHistory rows written
 * while statements were stale:
 *   npx tsx scripts/repair-valuation-history-ttm.ts --after=YYYY-MM-DD
 *
 * Usage (on the VPS):
 *   npx tsx scripts/backfill-statement-gaps.ts [--dry-run] [--before=2026-06-01]
 *     [--limit=50] [--offset=0] [--delay=8000] [--app=http://localhost:3001]
 */
import { loadEnvFromFiles } from './_utils/loadEnv';

loadEnvFromFiles();

import { prisma } from '../src/lib/db/prisma';

const arg = (k: string) => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=')[1];
const dryRun = process.argv.includes('--dry-run');
const BEFORE = arg('before') ? new Date(arg('before')!) : new Date(Date.now() - 80 * 24 * 3600 * 1000);
const LIMIT = arg('limit') ? parseInt(arg('limit')!, 10) : null;
const OFFSET = arg('offset') ? parseInt(arg('offset')!, 10) : 0;
const DELAY_MS = arg('delay') ? parseInt(arg('delay')!, 10) : 8000;
const APP = arg('app') ?? 'http://localhost:3001';

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function latestQuarterlyEnd(symbol: string): Promise<Date | null> {
    const agg = await prisma.financialStatement.aggregate({
        where: { symbol, fiscalPeriod: { not: 'FY' } },
        _max: { endDate: true },
    });
    return agg._max.endDate;
}

async function main() {
    const grouped = await prisma.financialStatement.groupBy({
        by: ['symbol'],
        where: { fiscalPeriod: { not: 'FY' } },
        _max: { endDate: true },
    });
    const stale = grouped
        .filter(g => g._max.endDate && g._max.endDate.getTime() < BEFORE.getTime())
        .map(g => ({ symbol: g.symbol, latest: g._max.endDate! }))
        .sort((a, b) => a.symbol.localeCompare(b.symbol));

    const batch = stale.slice(OFFSET, LIMIT ? OFFSET + LIMIT : undefined);
    console.log(`[backfill] ${stale.length} stale tickers (latestQ < ${BEFORE.toISOString().slice(0, 10)}), processing ${batch.length}${dryRun ? ' (DRY RUN)' : ''}`);
    if (dryRun) {
        for (const s of batch) console.log(`  ${s.symbol} ${s.latest.toISOString().slice(0, 10)}`);
        await prisma.$disconnect();
        return;
    }

    let improved = 0, stillStale = 0, failed = 0;
    const stillStaleList: string[] = [];

    for (let i = 0; i < batch.length; i++) {
        const { symbol, latest } = batch[i]!;
        const t0 = Date.now();
        try {
            const res = await fetch(`${APP}/api/analysis/${symbol}`, {
                method: 'POST',
                signal: AbortSignal.timeout(180_000),
            });
            const ms = ((Date.now() - t0) / 1000).toFixed(1);
            if (!res.ok) {
                console.log(`[${i + 1}/${batch.length}] ${symbol} HTTP ${res.status} (${ms}s)`);
                failed++;
            } else {
                const after = await latestQuarterlyEnd(symbol);
                if (after && after.getTime() > latest.getTime()) {
                    improved++;
                    console.log(`[${i + 1}/${batch.length}] ${symbol} 200 (${ms}s) ${latest.toISOString().slice(0, 10)} -> ${after.toISOString().slice(0, 10)}`);
                } else {
                    stillStale++;
                    stillStaleList.push(symbol);
                    console.log(`[${i + 1}/${batch.length}] ${symbol} 200 (${ms}s) still ${after ? after.toISOString().slice(0, 10) : 'none'}`);
                }
            }
        } catch (e: any) {
            failed++;
            console.log(`[${i + 1}/${batch.length}] ${symbol} ERROR ${e?.message ?? e}`);
        }
        if (i < batch.length - 1) await sleep(DELAY_MS);
    }

    console.log(`\n[backfill] done: improved=${improved} still-stale=${stillStale} failed=${failed}`);
    if (stillStaleList.length) console.log(`[backfill] still stale: ${stillStaleList.join(', ')}`);
    console.log(`[backfill] next: npx tsx scripts/repair-valuation-history-ttm.ts --after=${BEFORE.toISOString().slice(0, 10)}`);
    await prisma.$disconnect();
}

main().catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
});
