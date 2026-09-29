/**
 * Fill missing DailyValuationHistory rows for a single trading day.
 *
 * Thin wrapper around fillValuationDay() — the same step the post-market
 * reset now runs automatically each trading day. Use this for repairs of
 * historical dates (e.g. after a missed/broken daily run). No API calls —
 * closePrice from DailyRef.regularClose, multiples via computeTTMAtDate.
 *
 * Usage:
 *   npx tsx scripts/fill-valuation-day.ts --date=2026-09-28 [--dry-run]
 */
import { loadEnvFromFiles } from './_utils/loadEnv';

loadEnvFromFiles();

import { fillValuationDay } from '../src/services/analysis/fillValuationDay';
import { prisma } from '../src/lib/db/prisma';

const dryRun = process.argv.includes('--dry-run');
const dateArg = process.argv.find(a => a.startsWith('--date='));

if (!dateArg) {
    console.error('Usage: fill-valuation-day.ts --date=YYYY-MM-DD [--dry-run]');
    process.exit(1);
}
const dateET = dateArg.split('=')[1]!;

async function main() {
    if (dryRun) {
        const { prisma: p } = await import('../src/lib/db/prisma');
        const DAY_START = new Date(dateET + 'T00:00:00Z');
        const DAY_END = new Date(DAY_START.getTime() + 86_400_000);
        const closes = await p.dailyRef.count({ where: { date: { gte: DAY_START, lt: DAY_END }, regularClose: { not: null } } });
        const existing = await p.dailyValuationHistory.count({ where: { date: { gte: DAY_START, lt: DAY_END } } });
        console.log(`[dry-run] ${dateET}: ${closes} closes, ${existing} valuation rows present, ${closes - existing} would be filled`);
        return;
    }

    const result = await fillValuationDay(dateET);
    console.log(`[fill] ${result.day}: ${result.closes} closes → ${result.filled} created, ${result.updated} corrected, ${result.unchanged} unchanged (${result.priceOnly} price-only), ${result.failed} failed`);
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
