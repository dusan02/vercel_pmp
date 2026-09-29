/**
 * Delete dead Ticker rows (zombie symbols: never listed, delisted renames,
 * name-derived artifacts). FK on_delete: CASCADE removes all child rows.
 *
 * Verify the symbol is actually dead first (no recent Polygon aggs) — this
 * script deletes unconditionally.
 *
 * Usage:
 *   npx tsx scripts/delete-dead-tickers.ts --symbols=QUALCOMM,MESSO [--dry-run]
 */
import { loadEnvFromFiles } from './_utils/loadEnv';

loadEnvFromFiles();

import { prisma } from '../src/lib/db/prisma';

const arg = (name: string) => process.argv.find(a => a.startsWith(`--${name}=`))?.split('=')[1] ?? null;
const dryRun = process.argv.includes('--dry-run');
const symbols = (arg('symbols') ?? '').split(',').map(s => s.trim().toUpperCase()).filter(Boolean);

if (symbols.length === 0) {
    console.error('Usage: delete-dead-tickers.ts --symbols=A,B,C [--dry-run]');
    process.exit(1);
}

async function main() {
    for (const symbol of symbols) {
        const t = await prisma.ticker.findUnique({
            where: { symbol },
            select: { symbol: true, name: true, lastPrice: true },
        });
        if (!t) { console.log(`${symbol}: not found, skipping`); continue; }

        const stmts = await prisma.financialStatement.count({ where: { symbol } });
        const vals = await prisma.dailyValuationHistory.count({ where: { symbol } });
        const refs = await prisma.dailyRef.count({ where: { symbol } });
        console.log(`${symbol} (${t.name ?? '?'}): ${vals} valuation + ${stmts} statements + ${refs} refs ${dryRun ? '— would delete' : '— deleting'}`);

        if (!dryRun) {
            await prisma.ticker.delete({ where: { symbol } });
            console.log(`  ✅ deleted`);
        }
    }
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
