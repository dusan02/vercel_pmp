/**
 * Backfill AnalysisCache.fundLevel / valLevel / verdictKey — the normalized
 * PMP-verdict classification persisted at compute time (scoreCalculator).
 *
 * Reconstructs the classification inputs from what the write path uses:
 *   fundLevel  — avg of stored pillar scores (growth/profit/health/quality)
 *   valLevel   — pePercentile (stored) unless P/E distorted (peCurrent > 60
 *                and > 3x median → falls back to psPercentile), cyclical-
 *                recovery guard (forwardPe < peCurrent/2 softens expensive),
 *                valuation pillar score as last fallback
 *   verdictKey — '<fund>_<val>' | 'none_<val>' | 'insufficient' | null
 *
 * Runs the SAME classifyVerdict the page renders, so screener filters match
 * the verdict card exactly.
 *
 * Usage:
 *   npx tsx scripts/backfill-verdict-levels.ts [--dry-run] [--symbols=LRCX,APH]
 */
import { loadEnvFromFiles } from './_utils/loadEnv';

loadEnvFromFiles();

import { prisma } from '../src/lib/db/prisma';
import { dbWriteRetry as dbWrite } from '../src/lib/db/writeRetry';
import { classifyVerdict } from '../src/lib/analysis/verdict';
import type { PillarScores } from '../src/services/analysis/pillars';
import { medianOf, percentileBelow } from '../src/services/analysis/valuationHistory';

const dryRun = process.argv.includes('--dry-run');
const symbolsArg = process.argv.find(a => a.startsWith('--symbols='));
const SYMBOL_LIST = symbolsArg
    ? symbolsArg.split('=')[1]!.split(',').map(s => s.trim().toUpperCase()).filter(Boolean)
    : null;

async function main() {
    const rows = await prisma.analysisCache.findMany({
        where: SYMBOL_LIST ? { symbol: { in: SYMBOL_LIST } } : {},
        select: {
            symbol: true, growthScore: true, profitabilityScore: true,
            healthScore: true, qualityScore: true, valuationScore: true,
            pePercentile: true, fundLevel: true, valLevel: true, verdictKey: true,
        },
        orderBy: { symbol: 'asc' },
    });
    console.log(`[verdict] ${rows.length} analysis rows ${dryRun ? '(DRY RUN)' : ''}`);

    let changed = 0;
    const keyCounts = new Map<string, number>();
    for (const row of rows) {
        // Synthetic pillar shape — classifyVerdict only reads .score per key.
        const pillars = {
            growth: { score: row.growthScore },
            profitability: { score: row.profitabilityScore },
            health: { score: row.healthScore },
            quality: { score: row.qualityScore },
            valuation: { score: row.valuationScore },
        } as unknown as PillarScores;

        // insufficientData parity with analysisCompute: no statement carries
        // revenue or netIncome → the page shows "Insufficient financial data".
        const hasFundamentals = await prisma.financialStatement.findFirst({
            where: { symbol: row.symbol, OR: [{ revenue: { not: null } }, { netIncome: { not: null } }] },
            select: { symbol: true },
        });
        const insufficientData = !hasFundamentals;

        // Valuation inputs on the same close basis the write path uses.
        const [peRows, psRows, latestPe, latestPs, fh] = await Promise.all([
            prisma.dailyValuationHistory.findMany({
                where: { symbol: row.symbol, peRatio: { not: null } },
                select: { peRatio: true }, orderBy: { peRatio: 'asc' },
            }),
            prisma.dailyValuationHistory.findMany({
                where: { symbol: row.symbol, psRatio: { not: null, gt: 0 } },
                select: { psRatio: true }, orderBy: { psRatio: 'asc' },
            }),
            prisma.dailyValuationHistory.findFirst({
                where: { symbol: row.symbol, peRatio: { not: null } },
                orderBy: { date: 'desc' }, select: { peRatio: true },
            }),
            prisma.dailyValuationHistory.findFirst({
                where: { symbol: row.symbol, psRatio: { not: null, gt: 0 } },
                orderBy: { date: 'desc' }, select: { psRatio: true },
            }),
            prisma.finnhubMetrics.findUnique({
                where: { symbol: row.symbol }, select: { forwardPe: true },
            }),
        ]);
        const peMedian = peRows.length > 0 ? medianOf(peRows.map(r => r.peRatio!)) : null;
        const psPercentile = (psRows.length > 0 && latestPs?.psRatio != null && latestPs.psRatio > 0)
            ? percentileBelow(psRows.map(r => r.psRatio!), latestPs.psRatio)
            : null;
        const fwd = fh?.forwardPe ?? null;

        const vc = classifyVerdict({
            pillars,
            insufficientData,
            pePercentile: row.pePercentile,
            peCurrent: latestPe?.peRatio ?? null,
            peMedian,
            psPercentile,
            forwardPe: fwd !== null && fwd >= 1 ? fwd : null,
        });

        keyCounts.set(vc.verdictKey ?? 'null', (keyCounts.get(vc.verdictKey ?? 'null') ?? 0) + 1);
        if (vc.fundLevel === row.fundLevel && vc.valLevel === row.valLevel && vc.verdictKey === row.verdictKey) continue;
        changed++;
        if (changed <= 40 || dryRun) {
            console.log(`[verdict] ${row.symbol}: ${row.verdictKey ?? 'null'} → ${vc.verdictKey ?? 'null'} (fund=${vc.fundLevel ?? '-'} val=${vc.valLevel})`);
        }
        if (!dryRun) {
            await dbWrite(() => prisma.analysisCache.update({
                where: { symbol: row.symbol },
                data: { fundLevel: vc.fundLevel, valLevel: vc.valLevel, verdictKey: vc.verdictKey },
            }), 'backfillVerdict.update');
        }
    }

    console.log(`\n[verdict] done: ${changed} rows updated ${dryRun ? '(dry-run)' : ''}`);
    const dist = [...keyCounts.entries()].sort((a, b) => b[1] - a[1]);
    console.log('[verdict] key distribution:', dist.map(([k, c]) => `${k}:${c}`).join('  '));
    if (!dryRun && changed > 0) {
        console.log('Next: redis-cli -p 6380 --scan --pattern "screener:*" | xargs redis-cli -p 6380 DEL');
    }
}

main()
    .then(() => process.exit(0))
    .catch(e => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());
