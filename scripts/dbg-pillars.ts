import { prisma } from '@/lib/db/prisma';
import { computeMetrics, TICKER_SELECT } from '@/services/analysisCompute';
import { calculateScores } from '@/services/analysis/scoreCalculator';

async function main() {
    const sym = process.argv[2] || 'PM';
    const tickerRecord = await prisma.ticker.findUnique({ where: { symbol: sym }, select: TICKER_SELECT });
    const m = await computeMetrics(sym, tickerRecord);
    await calculateScores(sym, { skipVerdict: true, skipNotify: true });
    await prisma.$disconnect();
    if (!m) console.log('computeMetrics returned null');
}
main().catch(e => { console.error(e); process.exit(1); });
