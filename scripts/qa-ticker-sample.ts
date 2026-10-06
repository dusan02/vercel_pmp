/**
 * Cross-section QA probe — one pass over a deliberately diverse basket and a
 * compact metrics dump, meant to answer "is the repair global?" rather than
 * "is this one ticker right?".
 *
 * Covers: mega-cap, small-cap, refinery/oil cyclicals, semis, banks,
 * shipping, commodities, REIT, foreign/ADR, loss-maker, high-growth, ETF
 * (SPY — expected to show the no-statements edge honestly).
 *
 * Per ticker prints: latest quarterly period + age, TTM NI/Rev/EBIT,
 * P/E + its 5Y percentile, P/S, EV/EBIT, FCF yield + provenance, forward
 * P/E, pillar scores and the deterministic Verdict headline.
 *
 * Usage:
 *   npx tsx scripts/qa-ticker-sample.ts [--symbols=AAPL,PSX,...]
 */
import { loadEnvFromFiles } from './_utils/loadEnv';

loadEnvFromFiles();

import { prisma } from '../src/lib/db/prisma';
import { computeMetrics, TICKER_SELECT } from '../src/services/analysisCompute';
import { buildVerdict } from '../src/lib/analysis/verdict';

const BASKET = [
    'AAPL', 'NVDA', 'MSFT',            // mega-cap
    'PSX', 'VLO',                      // refinery cyclical
    'CVX', 'XOM',                      // oil
    'MU', 'INTC', 'AVGO',              // semiconductor
    'JPM', 'BAC',                      // bank
    'ZIM',                             // shipping
    'FCX', 'AA', 'NEM',                // commodities
    'O', 'AMT',                        // REIT
    'TSM', 'NVO', 'BABA',              // foreign / ADR
    'SNAP', 'PATH',                    // loss-maker
    'PLTR', 'HOOD',                    // high growth
    'SPY',                             // ETF — no statements expected
];

const fmt = (v: number | null | undefined, d = 1) => (v == null || !isFinite(v)) ? '—' : v.toFixed(d);
const b = (v: number | null | undefined) => (v == null) ? '—' : (v / 1e9).toFixed(2) + 'B';
const pct = (v: number | null | undefined) => (v == null) ? '—' : (v * 100).toFixed(1) + '%';

async function main() {
    const arg = process.argv.find(a => a.startsWith('--symbols='));
    const symbols = arg ? arg.split('=')[1]!.split(',').map(s => s.trim().toUpperCase()) : BASKET;

    console.log(`${'SYM'.padEnd(6)} ${'latestQ'.padEnd(10)} ${'ageD'.padStart(4)} ${'TTMni'.padStart(7)} ${'TTMrev'.padStart(7)} ${'TTMebit'.padStart(7)} ${'PE'.padStart(6)} ${'pct'.padStart(4)} ${'PS'.padStart(5)} ${'EV/E'.padStart(5)} ${'FCFy'.padStart(6)} ${'src'.padStart(7)} ${'fwdPE'.padStart(6)} ${'G/P/H/Q'.padStart(13)} verdict`);

    for (const symbol of symbols) {
        try {
            const tickerRecord = await prisma.ticker.findUnique({ where: { symbol }, select: TICKER_SELECT });
            if (!tickerRecord) { console.log(`${symbol.padEnd(6)} no Ticker row`); continue; }

            const latestQ = await prisma.financialStatement.findFirst({
                where: { symbol, fiscalPeriod: { not: 'FY' } },
                orderBy: { endDate: 'desc' },
                select: { endDate: true },
            });
            const m = await computeMetrics(symbol, tickerRecord);

            const latestQStr = latestQ?.endDate.toISOString().slice(0, 10) ?? '—';
            const ageDays = latestQ ? Math.round((Date.now() - latestQ.endDate.getTime()) / 86400000) : -1;
            const vhs = m.valuationHistoryStats;
            const pillars = m.pillars;
            const pillarStr = pillars
                ? ['growth', 'profitability', 'health', 'quality'].map(k => {
                    const p = (pillars as any)[k];
                    return p?.score != null ? String(Math.round(p.score)).padStart(2) : '—';
                }).join('/')
                : '—';
            const verdict = buildVerdict({
                pillars,
                pePercentile: vhs?.pe.percentile ?? null,
                peCurrent: vhs?.pe.current ?? null,
                peMedian: vhs?.pe.median ?? null,
                peYears: vhs?.pe.years ?? null,
                psPercentile: vhs?.ps.percentile ?? null,
                forwardPe: m.metrics.forwardPe ?? null,
                revenueGrowthYoY: (m as any).revenueGrowthYoY ?? null,
                revenueCagr: (m as any).revenueCagr ?? null,
            });

            const flag = ageDays > 110 ? ' ⚠STALE' : '';
            console.log(
                `${symbol.padEnd(6)} ${latestQStr.padEnd(10)} ${String(ageDays).padStart(4)} ${b(m.ttm.netIncome).padStart(7)} ${b(m.ttm.revenue).padStart(7)} ${b(m.ttm.ebit).padStart(7)} ${fmt(m.metrics.currentPe).padStart(6)} ${fmt(vhs?.pe.percentile ?? null, 0).padStart(4)} ${fmt(m.metrics.psRatio).padStart(5)} ${fmt(m.metrics.evEbit).padStart(5)} ${pct(m.metrics.fcfYield).padStart(6)} ${(m.metrics.fcfYieldSource ?? '—').padStart(7)} ${fmt(m.metrics.forwardPe).padStart(6)} ${pillarStr.padEnd(13)} ${verdict?.headline ?? '—'}${flag}`
            );
        } catch (e: any) {
            console.log(`${symbol.padEnd(6)} ERROR ${e?.message ?? e}`);
        }
    }

    await prisma.$disconnect();
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
