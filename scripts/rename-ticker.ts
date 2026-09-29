/**
 * Rename a ticker symbol — UPDATE on the Ticker PK cascades to all child rows
 * (FK on_update: CASCADE on DailyValuationHistory, FinancialStatement,
 * AnalysisCache, FinnhubMetrics, ...), preserving the company's real history
 * under the new symbol.
 *
 * Use for symbol renames where the OLD symbol is dead and the NEW one is the
 * live instrument (BK→BNY). Do NOT use when the target already exists or when
 * the old row is a foreign-instrument duplicate (delete it instead).
 *
 * Usage:
 *   npx tsx scripts/rename-ticker.ts --from=BK --to=BNY [--name="BNY Mellon"] [--dry-run]
 */
import { loadEnvFromFiles } from './_utils/loadEnv';

loadEnvFromFiles();

import { prisma } from '../src/lib/db/prisma';

const arg = (name: string) => process.argv.find(a => a.startsWith(`--${name}=`))?.split('=')[1] ?? null;
const dryRun = process.argv.includes('--dry-run');
const FROM = arg('from')?.toUpperCase() ?? null;
const TO = arg('to')?.toUpperCase() ?? null;
const NAME = arg('name');

if (!FROM || !TO) {
    console.error('Usage: rename-ticker.ts --from=OLD --to=NEW [--name="Company Name"] [--dry-run]');
    process.exit(1);
}

const CHILD_TABLES = [
    'FinancialStatement', 'DailyValuationHistory', 'DailyRef', 'SessionPrice',
    'AnalysisCache', 'FinnhubMetrics', 'FinnhubProfile', 'FinnhubRecommendation',
    'FinnhubPriceTarget', 'FinnhubInsiderTransaction', 'InsiderAggregate',
    'MoverEvent', 'EwScoreSnapshot', 'EarningsCalendar',
];

async function countChildren(symbol: string): Promise<Record<string, number>> {
    const out: Record<string, number> = {};
    for (const t of CHILD_TABLES) {
        try {
            const rows = await prisma.$queryRawUnsafe<{ c: bigint }[]>(
                `SELECT COUNT(*) as c FROM "${t}" WHERE symbol = ?`, symbol);
            const c = Number(rows[0]?.c ?? 0);
            if (c > 0) out[t] = c;
        } catch { /* table may not exist — skip */ }
    }
    return out;
}

async function main() {
    const from = await prisma.ticker.findUnique({ where: { symbol: FROM } });
    const to = await prisma.ticker.findUnique({ where: { symbol: TO } });

    if (!from) { console.error(`❌ ${FROM} not found`); process.exit(1); }
    if (to) { console.error(`❌ ${TO} already exists — refusing to merge. Delete one first.`); process.exit(1); }

    const children = await countChildren(FROM);
    console.log(`${FROM} → ${TO} ${dryRun ? '(DRY RUN)' : ''}`);
    console.log(`  children to migrate: ${JSON.stringify(children)}`);

    if (dryRun) return;

    await prisma.$executeRawUnsafe(
        `UPDATE "Ticker" SET symbol = ?${NAME ? ', name = ?' : ''} WHERE symbol = ?`,
        ...(NAME ? [TO, NAME, FROM] : [TO, FROM]),
    );

    const after = await countChildren(TO);
    console.log(`  after rename: ${JSON.stringify(after)}`);
    const leftBehind = await countChildren(FROM);
    if (Object.keys(leftBehind).length > 0) {
        console.error(`  ⚠️ rows still under ${FROM}: ${JSON.stringify(leftBehind)} — FK cascade did not propagate`);
        process.exitCode = 1;
    } else {
        console.log(`✅ ${FROM} → ${TO} done (all children cascaded)`);
    }
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
